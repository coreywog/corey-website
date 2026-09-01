import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { listRecurringGroups, type RecurringGroupSummary } from "@/lib/recurringDetection";

const VALID_STATUSES = new Set<RecurringGroupSummary["status"]>(["pending", "confirmed", "dismissed"]);

/**
 * Lists detected recurring-charge groups for the Data Hub's Recurring
 * panel — "pending" (the review queue) by default; pass ?status=confirmed
 * or ?status=dismissed to see what's already been acted on.
 */
export async function GET(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam && VALID_STATUSES.has(statusParam as RecurringGroupSummary["status"])
    ? (statusParam as RecurringGroupSummary["status"])
    : "pending";

  try {
    const groups = await listRecurringGroups([status]);
    return NextResponse.json({ groups });
  } catch (err) {
    console.error("Failed to list recurring groups", err);
    return NextResponse.json({ error: "Failed to list recurring groups" }, { status: 500 });
  }
}
