import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function GET() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dashboards = await prisma.dashboard.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      order: true,
      tabs: { select: { _count: { select: { widgets: true } } } },
    },
  });
  // No single-query way to count a relation's relation (widgets nested two
  // levels under Dashboard) — sum each tab's own widget count instead.
  const withCounts = dashboards.map((d) => ({
    id: d.id,
    name: d.name,
    order: d.order,
    widgetCount: d.tabs.reduce((sum, t) => sum + t._count.widgets, 0),
  }));
  return NextResponse.json({ dashboards: withCounts });
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
    const maxOrder = await prisma.dashboard.aggregate({ _max: { order: true } });
    const dashboard = await prisma.dashboard.create({
      data: { name: parsed.data.name, order: (maxOrder._max.order ?? -1) + 1 },
    });
    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A dashboard with that name already exists" }, { status: 409 });
    }
    console.error("Failed to create dashboard", err);
    return NextResponse.json({ error: "Failed to create dashboard" }, { status: 500 });
  }
}
