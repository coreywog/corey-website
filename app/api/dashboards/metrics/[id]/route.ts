import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { metricDefinitionSchema } from "../route";

/**
 * Edits a saved metric's full definition — the edit form (Settings' "Manage
 * calculated metrics" list, and the widget editor's own inline picker) always
 * resubmits every field rather than a true partial patch, so this reuses the
 * exact same schema `POST` (create) does instead of a separate "only what
 * changed" shape. Previously there was no way to edit a saved metric at
 * all, only create + delete.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = metricDefinitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const metric = await prisma.calculatedMetric.update({
      where: { id },
      data: {
        name: parsed.data.name,
        aggregation: parsed.data.aggregation,
        percentile: parsed.data.aggregation === "percentile" ? (parsed.data.percentile ?? null) : null,
        transactionCategory: parsed.data.transactionCategory ?? null,
        merchantCategories: parsed.data.merchantCategories ?? [],
        period: parsed.data.period ?? null,
        periodAggregation: parsed.data.period ? (parsed.data.periodAggregation ?? null) : null,
      },
    });
    return NextResponse.json({ metric });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A metric with that name already exists" }, { status: 409 });
    }
    console.error("Failed to update calculated metric", err);
    return NextResponse.json({ error: "Failed to update metric" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    await prisma.calculatedMetric.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete calculated metric", err);
    return NextResponse.json({ error: "Failed to delete metric" }, { status: 500 });
  }
}
