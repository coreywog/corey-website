import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ status: z.enum(["confirmed", "dismissed", "pending"]) });

/**
 * Confirm or dismiss a detected recurring group from the Data Hub's
 * Recurring panel. Once set, lib/recurringDetection.ts's next run leaves
 * this group's status alone — see its own comments — so a dismissal
 * sticks, and a confirmation doesn't get silently re-asked. Setting back
 * to "pending" is offered too (undo an accidental click), which just
 * returns the group to the review queue.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await prisma.recurringGroup.update({ where: { id }, data: { status: parsed.data.status } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to update recurring group", err);
    return NextResponse.json({ error: "Failed to update recurring group" }, { status: 500 });
  }
}
