import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { WIDGET_TYPES, WidgetConfigSchema, WidgetLayoutSchema } from "@/lib/dashboardConfig";

// Default size/position for a newly-added widget: appended below whatever
// already exists (grid is 12 columns wide, so a fresh widget takes the full
// width) rather than requiring the caller to pick a spot.
const DEFAULT_WIDTH = 12;
const DEFAULT_HEIGHT = 4;

const createSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  title: z.string().trim().min(1).max(100).nullable().optional(),
  config: WidgetConfigSchema,
  layout: WidgetLayoutSchema.partial().optional(), // caller may omit; we append below existing content
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dashboardId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
  if (!dashboard) {
    return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });
  }

  try {
    let { x, y, w, h } = parsed.data.layout ?? {};
    if (x === undefined || y === undefined) {
      const existing = await prisma.dashboardWidget.findMany({
        where: { dashboardId },
        select: { y: true, h: true },
      });
      const bottom = existing.reduce((max, wgt) => Math.max(max, wgt.y + wgt.h), 0);
      x = 0;
      y = bottom;
    }
    w ??= DEFAULT_WIDTH;
    h ??= DEFAULT_HEIGHT;

    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId,
        type: parsed.data.type,
        title: parsed.data.title ?? null,
        x,
        y,
        w,
        h,
        config: parsed.data.config,
      },
    });
    return NextResponse.json({ widget }, { status: 201 });
  } catch (err) {
    console.error("Failed to create widget", err);
    return NextResponse.json({ error: "Failed to create widget" }, { status: 500 });
  }
}
