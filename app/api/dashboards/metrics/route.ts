import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const AGGREGATIONS = ["sum", "average", "count", "min", "max"] as const;
const TRANSACTION_CATEGORIES = ["income", "spending", "transfer", "other"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  aggregation: z.enum(AGGREGATIONS),
  transactionCategory: z.enum(TRANSACTION_CATEGORIES).nullable().optional(),
});

/**
 * Saved, reusable metrics for the dashboard builder — see
 * prisma/schema.prisma's CalculatedMetric for why this is an aggregation +
 * optional category filter rather than a full formula language. Global
 * (not per-dashboard), same as MerchantCategoryRule: build one once, use it
 * on any widget from then on.
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const maxOrder = await prisma.calculatedMetric.aggregate({ _max: { order: true } });
    const metric = await prisma.calculatedMetric.create({
      data: {
        name: parsed.data.name,
        aggregation: parsed.data.aggregation,
        transactionCategory: parsed.data.transactionCategory ?? null,
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
