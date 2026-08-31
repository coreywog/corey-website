import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    published: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.published !== undefined, { message: "Nothing to update" });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    include: {
      tabs: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { widgets: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!dashboard) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ dashboard });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const dashboard = await prisma.dashboard.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.published !== undefined ? { published: parsed.data.published } : {}),
      },
    });
    return NextResponse.json({ dashboard });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "A dashboard with that name already exists" }, { status: 409 });
    }
    console.error("Failed to rename dashboard", err);
    return NextResponse.json({ error: "Failed to rename dashboard" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    // ON DELETE CASCADE (see migration) takes its widgets with it.
    await prisma.dashboard.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete dashboard", err);
    return NextResponse.json({ error: "Failed to delete dashboard" }, { status: 500 });
  }
}
