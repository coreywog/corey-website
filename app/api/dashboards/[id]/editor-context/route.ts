import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { requireDashboardOwner } from "@/lib/dashboardAccess";
import { decryptText } from "@/lib/crypto";
import { normalizeMerchantName } from "@/lib/finance";

/**
 * Options for the widget editor's filter/category pickers (accounts,
 * category/subcategory combos, merchant names, saved calculated metrics) —
 * split out from the dashboard page's own server render (see
 * app/(site)/dashboards/[id]/page.tsx) because it was being unconditionally
 * refetched on every single tab switch, even for a *published* (view-only,
 * no editor at all) dashboard, or for a viewer who never opens the editor.
 * The merchant list in particular decrypts every spending transaction's
 * description — real cost that has nothing to do with just looking at a
 * tab. Fetched by DashboardGrid.tsx on demand, the first time the editor
 * actually opens, and cached client-side after that.
 *
 * Owner-only (the editor itself is owner-only — a shared viewer never sees
 * edit controls at all, see app/(site)/dashboards/[id]/page.tsx). Accounts/
 * categories/merchant names are scoped to the dashboard owner's own
 * FinanceAccounts as of 2026-09-09 — this used to hand back every
 * account's data app-wide, which would leak another account's linked
 * banks and spending into this dashboard's editor. Calculated metrics stay
 * global/shared on purpose (see prisma/schema.prisma's own comment).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const { id: dashboardId } = await params;
  if (!(await requireDashboardOwner(dashboardId, username))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [accounts, categorized, spendingDescriptions, calculatedMetrics] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { archived: false, addedByUsername: username },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: {
        category: "spending",
        merchantCategory: { not: null, notIn: ["other"] },
        merchantSubcategory: { not: null },
        account: { addedByUsername: username },
      },
      select: { merchantCategory: true, merchantSubcategory: true },
      distinct: ["merchantCategory", "merchantSubcategory"],
    }),
    // Merchant name isn't a plain column — it's derived from the encrypted
    // description (see lib/finance.ts's normalizeMerchantName) — so getting
    // the distinct list for the picker means decrypting every one, same
    // cost class as the Transaction Detail tab's own full sweep.
    prisma.transaction.findMany({
      where: { category: "spending", description: { not: null }, account: { addedByUsername: username } },
      select: { description: true },
    }),
    prisma.calculatedMetric.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
  ]);
  const categoryOptions = categorized
    .map((c) => ({ category: c.merchantCategory as string, subcategory: c.merchantSubcategory as string }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));
  const merchantOptions = [
    ...new Set(spendingDescriptions.map((t) => normalizeMerchantName(decryptText(t.description as string)))),
  ].sort();

  return NextResponse.json({ accounts, categoryOptions, merchantOptions, calculatedMetrics });
}
