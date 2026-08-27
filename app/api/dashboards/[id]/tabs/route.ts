import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const createSchema = z.object({ name: z.string().trim().min(1).max(100) });

/** Adds a new, empty tab to a dashboard — appended after its existing tabs. */
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
    const maxOrder = await prisma.dashboardTab.aggregate({ where: { dashboardId }, _max: { order: true } });
    const tab = await prisma.dashboardTab.create({
      data: { dashboardId, name: parsed.data.name, order: (maxOrder._max.order ?? -1) + 1 },
    });
    return NextResponse.json({ tab }, { status: 201 });
  } catch (err) {
    console.error("Failed to create tab", err);
    return NextResponse.json({ error: "Failed to create tab" }, { status: 500 });
  }
}
