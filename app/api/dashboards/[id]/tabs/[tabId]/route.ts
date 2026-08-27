import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const patchSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tabId: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tabId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const tab = await prisma.dashboardTab.update({ where: { id: tabId }, data: { name: parsed.data.name } });
    return NextResponse.json({ tab });
  } catch (err) {
    console.error("Failed to rename tab", err);
    return NextResponse.json({ error: "Failed to rename tab" }, { status: 500 });
  }
}

/** Deletes a tab and its widgets. Refuses to delete a dashboard's last tab — every dashboard needs somewhere to put widgets. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; tabId: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: dashboardId, tabId } = await params;
  try {
    const tabCount = await prisma.dashboardTab.count({ where: { dashboardId } });
    if (tabCount <= 1) {
      return NextResponse.json({ error: "Can't delete a dashboard's last tab" }, { status: 400 });
    }
    // ON DELETE CASCADE (see migration) takes its widgets with it.
    await prisma.dashboardTab.delete({ where: { id: tabId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete tab", err);
    return NextResponse.json({ error: "Failed to delete tab" }, { status: 500 });
  }
}
