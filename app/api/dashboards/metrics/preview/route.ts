import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { dateRangeSchema } from "@/lib/dashboardConfig";
import { metricDefinitionSchema } from "../route";
import { computeDraftMetricPreview, toCustomMetric } from "@/lib/dashboardQuery";

// Reuses metricDefinitionSchema as-is (name included) rather than an
// `.omit({ name: true })` variant — that schema is a refined ZodEffects
// (two .refine() calls for the percentile/periodAggregation cross-field
// rules), and .omit isn't available past a refine. The caller (
// MetricBuilderPanel) always sends *some* name even before the user has
// typed one — this route just never reads it back.
const bodySchema = z.object({
  metric: metricDefinitionSchema,
  scope: z
    .object({
      accountIds: z.array(z.string().min(1)).optional(),
      dateRange: dateRangeSchema.optional(),
    })
    .optional(),
});

/**
 * Runs an unsaved calculated-metric definition against real data — the
 * metric builder's live "here's what this actually computes" feedback, so
 * building a metric isn't a blind form. See lib/dashboardQuery.ts's
 * computeDraftMetricPreview, which this only validates for and delegates
 * to; no computation happens in this file.
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
    return NextResponse.json({ error: "Invalid metric", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const preview = await computeDraftMetricPreview(toCustomMetric(parsed.data.metric), parsed.data.scope ?? {});
    return NextResponse.json(preview);
  } catch (err) {
    console.error("Failed to compute metric preview", err);
    return NextResponse.json({ error: "Failed to compute preview" }, { status: 500 });
  }
}
