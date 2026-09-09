import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { getDashboardAccess } from "@/lib/dashboardAccess";
import { WidgetConfigSchema, WIDGET_TYPES } from "@/lib/dashboardConfig";
import { computeWidgetData } from "@/lib/dashboardQuery";

// type travels alongside config (not derivable from it) because scatter's
// per-transaction points and a stat tile's single aggregate share the same
// "no groupBy" config shape — computeWidgetData needs the widget's actual
// type to tell them apart. See its own early branch on type === "scatter".
// dashboardId scopes the computation to that dashboard's owner's own
// FinanceAccounts (see lib/dashboardQuery.ts's DashboardScope) — this route
// is called both by the widget editor (owner-only) and, live, by a
// published widget's own on-tile date-range override/calendar picker
// (Widget.tsx), which a shared viewer can also trigger — getDashboardAccess
// (read access: owner OR shared-with) covers both correctly.
const bodySchema = z.object({
  type: z.enum(WIDGET_TYPES),
  config: WidgetConfigSchema,
  dashboardId: z.string().min(1),
});

/**
 * Runs an unpersisted widget config through the same aggregation the saved
 * version would use — the widget editor's live preview, so what you see
 * while editing is exactly what you'll get after saving.
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

  try {
    const result = await computeWidgetData(parsed.data.config, parsed.data.type, { ownerUsername: access.ownerUsername });
    return NextResponse.json({ result });
  } catch (err) {
    console.error("Failed to compute widget preview", err);
    return NextResponse.json({ error: "Failed to compute preview" }, { status: 500 });
  }
}
