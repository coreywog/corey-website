import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(2000) });

/**
 * The Review tab's "Approve all with a suggested category" bulk action —
 * with two years of Plaid history, hundreds of transactions can be pending
 * at once, and most of them already have a confident classifier guess
 * (static rules / a learned MerchantCategoryRule / Plaid's own category)
 * sitting right there unconfirmed. This flips reviewed=true for exactly
 * those, using whatever category/subcategory is *already* stored — it
 * never accepts new values from the client, so there's no way to bulk-set
 * something the classifier didn't actually land on. Anything still at
 * merchantCategory="other" (no real guess) is left alone; those still need
 * an actual human look, one at a time, same as before.
 */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await prisma.transaction.updateMany({
      where: {
        id: { in: parsed.data.ids },
        category: "spending",
        reviewed: false,
        merchantCategory: { not: null, notIn: ["other"] },
        merchantSubcategory: { not: null, notIn: ["other"] },
      },
      data: { reviewed: true },
    });
    return NextResponse.json({ approvedCount: result.count });
  } catch (err) {
    console.error("Failed to bulk-approve transactions", err);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}
