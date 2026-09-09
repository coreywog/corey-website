import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { requireDashboardOwner } from "@/lib/dashboardAccess";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    // Reordering — see DashboardTabs.tsx's moveTab, which swaps a tab with
    // its neighbor by PATCHing both with each other's `order` value. No
    // dedicated bulk-reorder endpoint: a single adjacent swap only ever
    // touches two tabs, so two of these cover it.
    order: z.number().int().optional(),
  })
  .refine((v) => v.name !== undefined || v.order !== undefined, { message: "Nothing to update" });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; tabId: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const { id: dashboardId, tabId } = await params;
  if (!(await requireDashboardOwner(dashboardId, username))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Compound where — {id, dashboardId} — not just {id}: closes a gap
    // where this route used to update a tab by its bare id alone, with
    // nothing checking it actually belonged to the dashboard in the URL.
    const tab = await prisma.dashboardTab.update({
      where: { id: tabId, dashboardId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
      },
    });
    return NextResponse.json({ tab });
  } catch (err) {
    console.error("Failed to update tab", err);
    return NextResponse.json({ error: "Failed to update tab" }, { status: 500 });
  }
}

/** Deletes a tab and its widgets. Refuses to delete a dashboard's last tab — every dashboard needs somewhere to put widgets. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; tabId: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const { id: dashboardId, tabId } = await params;
  if (!(await requireDashboardOwner(dashboardId, username))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const tabCount = await prisma.dashboardTab.count({ where: { dashboardId } });
    if (tabCount <= 1) {
      return NextResponse.json({ error: "Can't delete a dashboard's last tab" }, { status: 400 });
    }
    // Compound where — same bare-id gap closed as PATCH above.
    // ON DELETE CASCADE (see migration) takes its widgets with it.
    await prisma.dashboardTab.delete({ where: { id: tabId, dashboardId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete tab", err);
    return NextResponse.json({ error: "Failed to delete tab" }, { status: 500 });
  }
}
