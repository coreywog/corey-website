import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { requireDashboardOwner } from "@/lib/dashboardAccess";

// dashboardId scopes this to that dashboard's owner's own FinanceAccounts —
// only called from the widget editor (WidgetEditorPanel.tsx), which is
// owner-only, so requireDashboardOwner (not the broader getDashboardAccess
// the live-viewer-facing preview/date-bounds routes use) is correct here.
const bodySchema = z.object({ accountIds: z.array(z.string().min(1)).optional(), dashboardId: z.string().min(1) });

/**
 * The actual earliest/latest transaction date available — different
 * accounts can have very different histories (a Plaid-connected account's
 * data only goes back as far as it was ever requested; a manually-imported
 * one might go back further, or not as far), so the widget editor re-asks
 * this whenever the account filter changes rather than showing one fixed
 * site-wide range.
 */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }
  if (!(await requireDashboardOwner(parsed.data.dashboardId, username))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const where = {
    account: { addedByUsername: username },
    ...(parsed.data.accountIds?.length ? { accountId: { in: parsed.data.accountIds } } : {}),
  };
  const range = await prisma.transaction.aggregate({ where, _min: { date: true }, _max: { date: true } });

  return NextResponse.json({
    earliest: range._min.date?.toISOString().slice(0, 10) ?? null,
    latest: range._max.date?.toISOString().slice(0, 10) ?? null,
  });
}
