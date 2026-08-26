import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { plaid } from "@/lib/plaid";
import { decryptText, encryptText } from "@/lib/crypto";
import { classifyMerchant } from "@/lib/merchantClassify";
import { loadRules, findRuleMatch } from "@/lib/merchantRules";
import { mapPlaidCategoryToTaxonomy } from "@/lib/plaidCategoryMap";
import { classifyMerchantWithAi } from "@/lib/merchantAiClassify";

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
//
// That covers the receiving side (the payment landing on the Amex account),
// but the paying side — the ACH debit on Chase checking/savings — gets no
// TRANSFER_IN/OUT or LOAN_PAYMENTS tag at all from Plaid; it's indistinguishable
// from real spending by PFC alone (confirmed: "AMERICAN EXPRESS ACH PMT ..."
// on Chase Savings landed in the Review queue as plain spending). Fall back to
// a description match — the exact same "american express" / "epayment"
// patterns scripts/extract_statements.py has always used for the manually-
// imported Chase PDF data, so both pipelines treat this consistently.
const CARD_PAYMENT_DEBIT_PATTERN = /american express|amex.*epayment|\bepayment\b/i;

function classifyCategory(
  amount: number,
  primaryPfc: string | null | undefined,
  detailedPfc: string | null | undefined,
  description: string | null,
): string {
  if (primaryPfc === "TRANSFER_IN" || primaryPfc === "TRANSFER_OUT") return "transfer";
  if (detailedPfc === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "transfer";
  if (description && CARD_PAYMENT_DEBIT_PATTERN.test(description)) return "transfer";
  if (amount < 0) return "spending";
  if (primaryPfc === "INCOME") return "income";
  return "other";
}

export type SyncResult = { itemId: string; added: number; modified: number; removed: number };

// Plaid's location object has a lot of optional fields — street address
// plus city/region is a useful, low-noise summary of "where was this."
function formatLocation(
  location: { address?: string | null; city?: string | null; region?: string | null } | null | undefined,
): string | null {
  if (!location) return null;
  const parts = [location.address, location.city, location.region].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Pulls the richer, Plaid-only detail fields out of one sync'd transaction. */
function extractDetail(t: {
  name: string;
  merchant_name?: string | null;
  location?: { address?: string | null; city?: string | null; region?: string | null } | null;
  payment_channel?: string | null;
  website?: string | null;
  personal_finance_category?: { detailed?: string | null } | null;
}) {
  const description = t.merchant_name ?? t.name ?? null;
  // Only keep rawName separately when it actually adds information beyond
  // the cleaned description — no point storing (and later encrypting) a
  // duplicate of the same string.
  const rawName = t.name && t.name !== description ? t.name : null;
  return {
    description,
    rawName,
    location: formatLocation(t.location),
    website: t.website ?? null,
    paymentChannel: t.payment_channel ?? null,
    plaidDetailedCategory: t.personal_finance_category?.detailed ?? null,
  };
}

// User corrections from the Review tab (MerchantCategoryRule) take priority
// over the static lib/merchantClassify.ts patterns — a rule exists because
// the static classifier got it wrong (or didn't recognize the merchant at
// all), so it should keep winning on every future sync too. If neither a
// rule nor the static classifier recognizes the merchant, fall back to
// Plaid's own categorization (lib/plaidCategoryMap.ts); if even that comes
// up empty, ask an AI model (lib/merchantAiClassify.ts, opt-in — only the
// bare merchant name is ever sent, cached so each merchant is looked up at
// most once) rather than leaving it at "other".
//
// A rule is human-authored (created from the Review tab), so a match means
// this classification is already confirmed — `reviewed: true` from the
// start. The static classifier, the Plaid fallback, and the AI fallback are
// all still just guesses (`reviewed: false`).
async function classifyMerchantWithRules(
  description: string,
  rules: Awaited<ReturnType<typeof loadRules>>,
  plaidDetailedCategory: string | null,
  knownPairs: { category: string; subcategory: string }[],
): Promise<{ merchantCategory: string; merchantSubcategory: string; reviewed: boolean }> {
  const ruleMatch = findRuleMatch(rules, description);
  if (ruleMatch) {
    return {
      merchantCategory: ruleMatch.merchantCategory,
      merchantSubcategory: ruleMatch.merchantSubcategory,
      reviewed: true,
    };
  }
  const staticGuess = classifyMerchant(description);
  if (staticGuess.merchantSubcategory !== "other") {
    return { ...staticGuess, reviewed: false };
  }
  const plaidGuess = mapPlaidCategoryToTaxonomy(plaidDetailedCategory);
  if (plaidGuess) {
    return { ...plaidGuess, reviewed: false };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const aiGuess = await classifyMerchantWithAi(description, knownPairs);
    if (aiGuess) return { ...aiGuess, reviewed: false };
  }
  return { ...staticGuess, reviewed: false };
}

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
  const rules = await loadRules();
  // For the AI fallback's "prefer an existing category" guidance — cheap to
  // fetch once per sync run rather than per transaction.
  const knownCategoryRows = await prisma.transaction.findMany({
    where: { category: "spending", merchantCategory: { not: null, notIn: ["other"] }, merchantSubcategory: { not: null } },
    select: { merchantCategory: true, merchantSubcategory: true },
    distinct: ["merchantCategory", "merchantSubcategory"],
  });
  const knownPairs = knownCategoryRows.map((r) => ({
    category: r.merchantCategory as string,
    subcategory: r.merchantSubcategory as string,
  }));

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
      const detail = extractDetail(t);
      const category = classifyCategory(
        amount,
        t.personal_finance_category?.primary,
        t.personal_finance_category?.detailed,
        detail.description,
      );
      // Same merchant classifier the manual import uses (lib/merchantClassify.ts,
      // ported from scripts/extract_statements.py) — only meaningful for
      // actual spending, matching that script's own gating.
      const merchant =
        category === "spending" && detail.description
          ? await classifyMerchantWithRules(detail.description, rules, detail.plaidDetailedCategory, knownPairs)
          : null;

      // `reviewed` is deliberately absent from `update` below — this upsert
      // also runs for transactions that already exist (e.g. a full resync
      // after resetting the cursor), and must never silently revert a
      // transaction a human already approved back to "needs review".
      // Only a brand-new row gets an initial reviewed value.
      await prisma.transaction.upsert({
        where: { plaidTransactionId: t.transaction_id },
        update: {
          date: new Date(t.date),
          amount: encryptText(String(amount)),
          category,
          description: detail.description ? encryptText(detail.description) : null,
          rawName: detail.rawName ? encryptText(detail.rawName) : null,
          location: detail.location ? encryptText(detail.location) : null,
          website: detail.website ? encryptText(detail.website) : null,
          paymentChannel: detail.paymentChannel,
          plaidDetailedCategory: detail.plaidDetailedCategory,
          merchantCategory: merchant?.merchantCategory ?? null,
          merchantSubcategory: merchant?.merchantSubcategory ?? null,
        },
        create: {
          accountId,
          date: new Date(t.date),
          amount: encryptText(String(amount)),
          category,
          description: detail.description ? encryptText(detail.description) : null,
          rawName: detail.rawName ? encryptText(detail.rawName) : null,
          location: detail.location ? encryptText(detail.location) : null,
          website: detail.website ? encryptText(detail.website) : null,
          paymentChannel: detail.paymentChannel,
          plaidDetailedCategory: detail.plaidDetailedCategory,
          merchantCategory: merchant?.merchantCategory ?? null,
          merchantSubcategory: merchant?.merchantSubcategory ?? null,
          reviewed: merchant?.reviewed ?? false,
          dedupeHash: sha256(t.transaction_id),
          plaidTransactionId: t.transaction_id,
        },
      });
      added++;
    }

    for (const t of response.data.modified) {
      if (t.pending) continue;
      const amount = -t.amount;
      const detail = extractDetail(t);
      const category = classifyCategory(
        amount,
        t.personal_finance_category?.primary,
        t.personal_finance_category?.detailed,
        detail.description,
      );
      const merchant =
        category === "spending" && detail.description
          ? await classifyMerchantWithRules(detail.description, rules, detail.plaidDetailedCategory, knownPairs)
          : null;
      // Same reasoning as the upsert above: never touch `reviewed` on an
      // update to an existing row.
      const updated = await prisma.transaction
        .update({
          where: { plaidTransactionId: t.transaction_id },
          data: {
            date: new Date(t.date),
            amount: encryptText(String(amount)),
            category,
            description: detail.description ? encryptText(detail.description) : null,
            rawName: detail.rawName ? encryptText(detail.rawName) : null,
            location: detail.location ? encryptText(detail.location) : null,
            website: detail.website ? encryptText(detail.website) : null,
            paymentChannel: detail.paymentChannel,
            plaidDetailedCategory: detail.plaidDetailedCategory,
            merchantCategory: merchant?.merchantCategory ?? null,
            merchantSubcategory: merchant?.merchantSubcategory ?? null,
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
