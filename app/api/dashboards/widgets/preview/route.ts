import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { WidgetConfigSchema } from "@/lib/dashboardConfig";
import { computeWidgetData } from "@/lib/dashboardQuery";

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
  const parsed = WidgetConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid config", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await computeWidgetData(parsed.data);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("Failed to compute widget preview", err);
    return NextResponse.json({ error: "Failed to compute preview" }, { status: 500 });
  }
}
