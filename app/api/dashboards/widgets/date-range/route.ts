import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const bodySchema = z.object({ accountIds: z.array(z.string().min(1)).optional() });

/**
 * The actual earliest/latest transaction date available — different
 * accounts can have very different histories (a Plaid-connected account's
 * data only goes back as far as it was ever requested; a manually-imported
 * one might go back further, or not as far), so the widget editor re-asks
 * this whenever the account filter changes rather than showing one fixed
 * site-wide range.
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

  const where = parsed.data.accountIds?.length ? { accountId: { in: parsed.data.accountIds } } : {};
  const range = await prisma.transaction.aggregate({ where, _min: { date: true }, _max: { date: true } });

  return NextResponse.json({
    earliest: range._min.date?.toISOString().slice(0, 10) ?? null,
    latest: range._max.date?.toISOString().slice(0, 10) ?? null,
  });
}
