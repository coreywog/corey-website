import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";

/** Revokes a previously-granted dashboard share (see ../route.ts's POST). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ viewerUsername: string }> }) {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const { viewerUsername } = await params;
  try {
    // deleteMany, not delete — a share that was never granted (already
    // revoked, or never existed) is a no-op, not an error.
    await prisma.accountShare.deleteMany({ where: { ownerUsername: username, viewerUsername } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to revoke dashboard share", err);
    return NextResponse.json({ error: "Failed to revoke" }, { status: 500 });
  }
}
