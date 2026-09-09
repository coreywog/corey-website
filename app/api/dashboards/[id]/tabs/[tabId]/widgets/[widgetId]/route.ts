import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { requireDashboardOwner } from "@/lib/dashboardAccess";
import { WidgetConfigSchema, WidgetLayoutSchema } from "@/lib/dashboardConfig";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(100).nullable().optional(),
    config: WidgetConfigSchema.optional(),
    layout: WidgetLayoutSchema.partial().optional(),
  })
  .refine((body) => body.title !== undefined || body.config !== undefined || body.layout !== undefined, {
    message: "Provide at least one of title, config, or layout",
  });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; tabId: string; widgetId: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const { id: dashboardId, tabId, widgetId } = await params;
  if (!(await requireDashboardOwner(dashboardId, username))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Compound where — closes a gap where this route used to update a
    // widget by its bare id alone, with nothing checking it actually
    // belonged to the tab/dashboard in the URL.
    const widget = await prisma.dashboardWidget.update({
      where: { id: widgetId, tabId },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.config !== undefined ? { config: parsed.data.config } : {}),
        ...(parsed.data.layout ?? {}),
      },
    });
    return NextResponse.json({ widget });
  } catch (err) {
    console.error("Failed to update widget", err);
    return NextResponse.json({ error: "Failed to update widget" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; tabId: string; widgetId: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const { id: dashboardId, tabId, widgetId } = await params;
  if (!(await requireDashboardOwner(dashboardId, username))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await prisma.dashboardWidget.delete({ where: { id: widgetId, tabId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete widget", err);
    return NextResponse.json({ error: "Failed to delete widget" }, { status: 500 });
  }
}
