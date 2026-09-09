import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { syncOneItem } from "@/lib/plaidSync";

const bodySchema = z.object({ plaidItemId: z.string().min(1).optional() });

/**
 * Pulls new/changed/removed transactions since the last sync for one Item
 * (or every connected Item, if none specified) using Plaid's cursor-based
 * /transactions/sync — the modern replacement for polling /transactions/get,
 * and what the webhook (app/api/plaid/webhook/route.ts) calls into once
 * that's wired up. Safe to call repeatedly; the cursor makes it incremental.
 *
 * Only syncs Items whose accounts the current account itself added — the
 * Settings UI already hides the Sync button for an item you don't own, but
 * that's cosmetic; this is the real enforcement (see
 * app/api/plaid/items/[id]/route.ts's DELETE for the same reasoning).
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

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (parsed.data.plaidItemId) {
    const owned = await prisma.plaidItem.findFirst({
      where: { id: parsed.data.plaidItemId, accounts: { some: { addedByUsername: username } } },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: "You can only sync banks you added yourself." }, { status: 403 });
    }
  }

  const items = await prisma.plaidItem.findMany({
    where: {
      ...(parsed.data.plaidItemId ? { id: parsed.data.plaidItemId } : {}),
      accounts: { some: { addedByUsername: username } },
    },
  });

  try {
    const results = [];
    for (const item of items) {
      results.push(await syncOneItem(item));
    }
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Plaid sync failed", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
