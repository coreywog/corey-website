import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { runRecurringDetection } from "@/lib/recurringDetection";

/**
 * Manually triggered from the Data Hub's Recurring panel ("Scan for
 * recurring charges") — see lib/recurringDetection.ts for what a run
 * actually does. Not run automatically on every page load (this walks
 * every un-grouped spending transaction, so it's cheap but not free) or
 * tied to Plaid sync yet — a fast-follow if scanning-on-demand turns out
 * to be too manual in practice.
 */
export async function POST() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runRecurringDetection();
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Failed to run recurring detection", err);
    return NextResponse.json({ error: "Failed to run recurring detection" }, { status: 500 });
  }
}
