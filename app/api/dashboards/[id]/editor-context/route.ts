import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
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
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dashboardId } = await params;

  const [accounts, categorized, spendingDescriptions, calculatedMetrics] = await Promise.all([
    prisma.financeAccount.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { category: "spending", merchantCategory: { not: null, notIn: ["other"] }, merchantSubcategory: { not: null } },
      select: { merchantCategory: true, merchantSubcategory: true },
      distinct: ["merchantCategory", "merchantSubcategory"],
    }),
    // Merchant name isn't a plain column — it's derived from the encrypted
    // description (see lib/finance.ts's normalizeMerchantName) — so getting
    // the distinct list for the picker means decrypting every one, same
    // cost class as the Transaction Detail tab's own full sweep.
    prisma.transaction.findMany({
      where: { category: "spending", description: { not: null } },
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

  // dashboardId isn't actually used to scope any of these — they're global,
  // not per-dashboard — but the route lives under a dashboard's own id for
  // symmetry with every other /api/dashboards/[id]/... route, and so a
  // future per-dashboard narrowing (e.g. accounts scoped to what a specific
  // dashboard's widgets reference) doesn't need a URL shape change.
  void dashboardId;

  return NextResponse.json({ accounts, categoryOptions, merchantOptions, calculatedMetrics });
}
