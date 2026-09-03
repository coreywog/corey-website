import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getCalculatedMetricUsage } from "@/lib/dashboardQuery";

/**
 * Which saved metrics are actually referenced by a real dashboard widget
 * right now, and where — one call for every metric at once (not one per
 * metric), so Settings can show it proactively next to every row and
 * re-check it right before a delete. See
 * lib/dashboardQuery.ts's getCalculatedMetricUsage, which this only
 * validates auth for and delegates to.
 */
export async function GET() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const usage = await getCalculatedMetricUsage();
    return NextResponse.json({ usage });
  } catch (err) {
    console.error("Failed to compute metric usage", err);
    return NextResponse.json({ error: "Failed to compute metric usage" }, { status: 500 });
  }
}
