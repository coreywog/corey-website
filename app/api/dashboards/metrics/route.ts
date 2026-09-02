import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

// Kept in sync by hand with lib/dashboardQuery.ts's own Aggregation/
// MetricPeriod/PeriodAggregation types — same "duplicated, not imported"
// convention that type already used before this session for its original
// 5 values, since the query engine's types are its own internal concern,
// not something an API route schema should reach into.
export const AGGREGATIONS = ["sum", "average", "count", "min", "max", "median", "percentile", "stddev", "variance", "range"] as const;
export const TRANSACTION_CATEGORIES = ["income", "spending", "transfer", "other"] as const;
export const METRIC_PERIODS = ["day", "week", "month", "year"] as const;
export const PERIOD_AGGREGATIONS = ["max", "min", "average", "growth"] as const;

// Shared by create (this file) and edit (./[id]/route.ts) — a metric's
// actual *definition* is the same shape either way, just create requires a
// name and edit's fields are all optional (only touch what's provided).
export const metricDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    aggregation: z.enum(AGGREGATIONS),
    // Required exactly when aggregation is "percentile" — enforced by the
    // .refine below, not the field type itself, so a clearer error message
    // can name the actual problem.
    percentile: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(90), z.literal(95), z.literal(99)]).nullable().optional(),
    transactionCategory: z.enum(TRANSACTION_CATEGORIES).nullable().optional(),
    merchantCategories: z.array(z.string().min(1)).max(50).optional(),
    period: z.enum(METRIC_PERIODS).nullable().optional(),
    periodAggregation: z.enum(PERIOD_AGGREGATIONS).nullable().optional(),
  })
  .refine((v) => v.aggregation !== "percentile" || v.percentile != null, {
    message: "Pick which percentile (25/50/75/90/95/99)",
    path: ["percentile"],
  })
  .refine((v) => !v.period || v.periodAggregation != null, {
    message: "Pick how to combine the periods (highest/lowest/average/growth)",
    path: ["periodAggregation"],
  });

/**
 * Saved, reusable metrics for the dashboard builder — see
 * prisma/schema.prisma's CalculatedMetric. Global (not per-dashboard), same
 * as MerchantCategoryRule: build one once, use it on any widget from then
 * on. Expanded this session from a plain (aggregation × transaction-type)
 * tuple to also support merchant-category scoping, percentile aggregations,
 * and periodic metrics (bucket-then-combine, e.g. "highest-spending
 * month") — see lib/dashboardQuery.ts's computeCustomMetricValue for the
 * actual math.
 */
export async function GET() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const metrics = await prisma.calculatedMetric.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ metrics });
}

export async function POST(request: NextRequest) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = metricDefinitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const maxOrder = await prisma.calculatedMetric.aggregate({ _max: { order: true } });
    const metric = await prisma.calculatedMetric.create({
      data: {
        name: parsed.data.name,
        aggregation: parsed.data.aggregation,
        percentile: parsed.data.aggregation === "percentile" ? (parsed.data.percentile ?? null) : null,
        transactionCategory: parsed.data.transactionCategory ?? null,
        merchantCategories: parsed.data.merchantCategories ?? [],
        period: parsed.data.period ?? null,
        periodAggregation: parsed.data.period ? (parsed.data.periodAggregation ?? null) : null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
    return NextResponse.json({ metric }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A metric with that name already exists" }, { status: 409 });
    }
    console.error("Failed to create calculated metric", err);
    return NextResponse.json({ error: "Failed to save metric" }, { status: 500 });
  }
}
