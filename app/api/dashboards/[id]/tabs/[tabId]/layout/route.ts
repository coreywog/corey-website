import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { WidgetLayoutSchema } from "@/lib/dashboardConfig";

// react-grid-layout's onLayoutChange fires with every tile's position at
// once (it re-flows the whole grid to avoid collisions on any single drag/
// resize) — this batches that into one request instead of one PATCH per
// widget. Caller debounces on drag/resize stop, not per pixel of movement.
const bodySchema = z.object({
  widgets: z.array(WidgetLayoutSchema.extend({ id: z.string().min(1) })).min(1),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tabId: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tabId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await prisma.$transaction(
      parsed.data.widgets.map((w) =>
        prisma.dashboardWidget.update({
          where: { id: w.id, tabId },
          data: { x: w.x, y: w.y, w: w.w, h: w.h },
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save dashboard layout", err);
    return NextResponse.json({ error: "Failed to save layout" }, { status: 500 });
  }
}
