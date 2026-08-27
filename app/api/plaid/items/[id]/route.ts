import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { plaid } from "@/lib/plaid";
import { decryptText } from "@/lib/crypto";

/**
 * Fully disconnects a Plaid Item: unlinks it on Plaid's side (so the
 * connection can't keep pulling data or count against usage) and removes
 * everything it synced — the FinanceAccounts and Transactions, not just the
 * PlaidItem row itself (the schema's ON DELETE SET NULL would otherwise
 * just orphan those accounts, leaving stale data behind). Meant for
 * reconnecting with different settings (e.g. more history requested), not
 * a "pause syncing" toggle — there's no undo.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.plaidItem.findUnique({
    where: { id },
    include: { accounts: { select: { id: true } } },
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Best-effort on Plaid's side — if the Item is already gone there (or
    // the token's stale) this shouldn't block cleaning up our own data.
    await plaid()
      .itemRemove({ access_token: decryptText(item.accessToken) })
      .catch((err) => console.error(`Plaid itemRemove failed for ${item.itemId} (continuing with local cleanup)`, err));

    const accountIds = item.accounts.map((a) => a.id);
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { accountId: { in: accountIds } } }),
      prisma.financeAccount.deleteMany({ where: { id: { in: accountIds } } }),
      prisma.plaidItem.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Failed to disconnect Plaid item ${id}`, err);
    return NextResponse.json({ error: "Failed to disconnect" }, { status: 500 });
  }
}
