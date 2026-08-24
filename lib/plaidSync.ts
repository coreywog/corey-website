import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { plaid } from "@/lib/plaid";
import { decryptText, encryptText } from "@/lib/crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Plaid's own spend/transfer signal (personal_finance_category) is more
// reliable than guessing from amount sign alone — this is exactly the kind
// of thing that went wrong with the old regex-only classifier (see the
// Venmo Cashout mixup earlier). Money in that isn't confidently INCOME
// lands in "other" for manual review rather than being assumed income.
//
// Credit card bill payments (paying your Amex from your checking account)
// don't get TRANSFER_IN/OUT — Plaid tags them LOAN_PAYMENTS /
// LOAN_PAYMENTS_CREDIT_CARD_PAYMENT instead, which otherwise falls through
// to "other" despite being just as much a self-transfer as a savings
// transfer. Other LOAN_PAYMENTS subtypes (mortgage, auto, student loan) are
// real money leaving to a third party, not moved between your own tracked
// accounts, so only this specific detailed category gets the transfer
// treatment.
function classifyCategory(
  amount: number,
  primaryPfc: string | null | undefined,
  detailedPfc: string | null | undefined,
): string {
  if (primaryPfc === "TRANSFER_IN" || primaryPfc === "TRANSFER_OUT") return "transfer";
  if (detailedPfc === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "transfer";
  if (amount < 0) return "spending";
  if (primaryPfc === "INCOME") return "income";
  return "other";
}

export type SyncResult = { itemId: string; added: number; modified: number; removed: number };

/**
 * Pulls new/changed/removed transactions since the last sync for one Item,
 * using Plaid's cursor-based /transactions/sync — incremental by design,
 * safe to call repeatedly (from the manual "Sync now" route, or from the
 * webhook once Plaid tells us new data is ready).
 */
export async function syncOneItem(item: {
  id: string;
  itemId: string;
  accessToken: string;
  cursor: string | null;
}): Promise<SyncResult> {
  const accessToken = decryptText(item.accessToken);
  const accounts = await prisma.financeAccount.findMany({
    where: { plaidItemId: item.id },
    select: { id: true, plaidAccountId: true },
  });
  const accountIdByPlaidId = new Map(accounts.map((a) => [a.plaidAccountId, a.id]));

  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  let added = 0;
  let modified = 0;
  let removed = 0;

  while (hasMore) {
    const response = await plaid().transactionsSync({ access_token: accessToken, cursor });

    for (const t of response.data.added) {
      if (t.pending) continue; // wait for the posted version on a later sync
      const accountId = accountIdByPlaidId.get(t.account_id);
      if (!accountId) continue; // an account on this Item we're not tracking

      // Plaid: positive amount = money out. Our convention (see lib/finance.ts):
      // negative = outflow, positive = inflow — the opposite, so flip the sign.
      const amount = -t.amount;
      const category = classifyCategory(
        amount,
        t.personal_finance_category?.primary,
        t.personal_finance_category?.detailed,
      );
      const description = t.merchant_name ?? t.name ?? null;

      await prisma.transaction.upsert({
        where: { plaidTransactionId: t.transaction_id },
        update: {
          date: new Date(t.date),
          amount: encryptText(String(amount)),
          category,
          description: description ? encryptText(description) : null,
        },
        create: {
          accountId,
          date: new Date(t.date),
          amount: encryptText(String(amount)),
          category,
          description: description ? encryptText(description) : null,
          dedupeHash: sha256(t.transaction_id),
          plaidTransactionId: t.transaction_id,
        },
      });
      added++;
    }

    for (const t of response.data.modified) {
      if (t.pending) continue;
      const amount = -t.amount;
      const category = classifyCategory(
        amount,
        t.personal_finance_category?.primary,
        t.personal_finance_category?.detailed,
      );
      const description = t.merchant_name ?? t.name ?? null;
      const updated = await prisma.transaction
        .update({
          where: { plaidTransactionId: t.transaction_id },
          data: {
            date: new Date(t.date),
            amount: encryptText(String(amount)),
            category,
            description: description ? encryptText(description) : null,
          },
        })
        .catch(() => null); // wasn't imported yet (was pending last sync) — fine, next add will cover it
      if (updated) modified++;
    }

    for (const r of response.data.removed) {
      if (!r.transaction_id) continue;
      await prisma.transaction
        .delete({ where: { plaidTransactionId: r.transaction_id } })
        .then(() => removed++)
        .catch(() => {}); // already gone / never imported (was pending) — fine either way
    }

    cursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: { cursor, lastSyncedAt: new Date() },
  });

  return { itemId: item.itemId, added, modified, removed };
}
