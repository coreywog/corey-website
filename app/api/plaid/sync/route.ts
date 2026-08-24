import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { syncOneItem } from "@/lib/plaidSync";

const bodySchema = z.object({ plaidItemId: z.string().min(1).optional() });

/**
 * Pulls new/changed/removed transactions since the last sync for one Item
 * (or every connected Item, if none specified) using Plaid's cursor-based
 * /transactions/sync — the modern replacement for polling /transactions/get,
 * and what the webhook (app/api/plaid/webhook/route.ts) calls into once
 * that's wired up. Safe to call repeatedly; the cursor makes it incremental.
 */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const items = await prisma.plaidItem.findMany({
    where: parsed.data.plaidItemId ? { id: parsed.data.plaidItemId } : undefined,
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
