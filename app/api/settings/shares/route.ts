import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";

const bodySchema = z.object({ viewerUsername: z.string().min(1) });

/**
 * Settings' "Shared dashboards" section — grants another account read/view
 * access to *all* of the current account's dashboards (see AccountShare's
 * own schema comment: whole-account, not per-dashboard; view-only, never
 * edit). POST grants, DELETE (see [viewerUsername]/route.ts) revokes.
 */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json({ error: "Your session is out of date — please log in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (parsed.data.viewerUsername === username) {
    return NextResponse.json({ error: "You can't share with yourself." }, { status: 400 });
  }

  const viewer = await prisma.adminCredential.findUnique({ where: { username: parsed.data.viewerUsername } });
  if (!viewer) {
    return NextResponse.json({ error: "No account with that username." }, { status: 404 });
  }

  try {
    await prisma.accountShare.upsert({
      where: { ownerUsername_viewerUsername: { ownerUsername: username, viewerUsername: parsed.data.viewerUsername } },
      update: {},
      create: { ownerUsername: username, viewerUsername: parsed.data.viewerUsername },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to grant dashboard share", err);
    return NextResponse.json({ error: "Failed to share" }, { status: 500 });
  }
}
