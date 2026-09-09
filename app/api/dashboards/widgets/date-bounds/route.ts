import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { getDashboardAccess } from "@/lib/dashboardAccess";
import { WidgetConfigSchema } from "@/lib/dashboardConfig";
import { computeDateBounds } from "@/lib/dashboardQuery";

// Same body shape as the /preview route's config (widget `type` isn't
// needed here — bounds only depend on the chart config's own filters, not
// which chart type renders it), plus dashboardId to scope the bounds to
// that dashboard's owner's own FinanceAccounts — see /preview's own
// comment for why getDashboardAccess (owner OR shared-with), not
// owner-only: this is called live by a published widget's own calendar
// date picker (Widget.tsx), which a shared viewer can also open.
const bodySchema = z.object({ config: WidgetConfigSchema, dashboardId: z.string().min(1) });

/**
 * The earliest/latest transaction date actually matching a widget's
 * filters, ignoring its own configured dateRange — backs the custom-range
 * calendar picker's min/max so it can't select a date with nothing to show.
 * See lib/dashboardQuery.ts's computeDateBounds for why this can't just be
 * a raw MIN/MAX query.
 */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid config", details: parsed.error.flatten() }, { status: 400 });
  }

  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }
  const access = await getDashboardAccess(parsed.data.dashboardId, username);
  if (!access.allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Text widgets have no transaction-backed dateRange at all — nothing to bound.
  if (parsed.data.config.dataSource !== "transactions") {
    return NextResponse.json({ bounds: null });
  }

  try {
    const bounds = await computeDateBounds(parsed.data.config, { ownerUsername: access.ownerUsername });
    return NextResponse.json({ bounds });
  } catch (err) {
    console.error("Failed to compute widget date bounds", err);
    return NextResponse.json({ error: "Failed to compute date bounds" }, { status: 500 });
  }
}
