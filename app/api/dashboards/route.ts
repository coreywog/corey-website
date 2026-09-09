import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function GET() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  // Only this account's own dashboards — this list only ever backs
  // create/rename-via-click-through/delete, all owner-only actions, so a
  // dashboard shared with this account (but not owned by it) has no
  // business showing up here (it's still reachable via the sidebar nav).
  const dashboards = await prisma.dashboard.findMany({
    where: { ownerUsername: username },
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
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Scoped to this account's own dashboards — otherwise a second
    // account's very first dashboard would inherit a large starting
    // `order` from everyone else's dashboards combined.
    const maxOrder = await prisma.dashboard.aggregate({ where: { ownerUsername: username }, _max: { order: true } });
    const dashboard = await prisma.dashboard.create({
      data: { name: parsed.data.name, ownerUsername: username, order: (maxOrder._max.order ?? -1) + 1 },
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
