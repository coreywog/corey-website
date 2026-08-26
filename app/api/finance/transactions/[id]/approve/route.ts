import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { saveRuleAndApply } from "@/lib/merchantRules";

const bodySchema = z.object({
  merchantCategory: z.string().trim().min(1).max(60),
  merchantSubcategory: z.string().trim().min(1).max(60),
  // Optional: also teach a lasting rule from this approval (Review tab's
  // "always match by name" / "always match this exact transaction"
  // toggles), applied to every past and future matching transaction — see
  // lib/merchantRules.ts. exactAmount narrows the rule to only transactions
  // with this same dollar amount too (e.g. a recurring loan payment vs. an
  // occasional charge from the same merchant for a different amount).
  saveAsRule: z.boolean().optional(),
  pattern: z.string().trim().min(1).max(200).optional(),
  exactAmount: z.number().optional(),
});

/**
 * Confirms a single transaction's category/subcategory — the "green check"
 * action in the Review tab. Sets reviewed=true regardless of whether the
 * category shown was the pre-filled best guess or something the user
 * picked instead. Optionally also saves a MerchantCategoryRule so future
 * (and other existing) matching transactions get this for free.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { merchantCategory, merchantSubcategory, saveAsRule, pattern, exactAmount } = parsed.data;

  if (saveAsRule && !pattern) {
    return NextResponse.json({ error: "pattern is required when saveAsRule is true" }, { status: 400 });
  }

  try {
    let appliedCount = 1;
    if (saveAsRule && pattern) {
      // Applies to every matching transaction (including this one, if its
      // description contains `pattern`, and — if exactAmount is set — only
      // ones with this exact dollar amount too) and marks them all reviewed.
      appliedCount = await saveRuleAndApply(pattern, merchantCategory, merchantSubcategory, exactAmount ?? null);
    }

    // Belt and suspenders: ensure this specific transaction is updated even
    // if saveAsRule's pattern match somehow missed it (e.g. a typo'd
    // pattern), or if this is a plain one-off approval with no rule at all.
    await prisma.transaction.update({
      where: { id },
      data: { merchantCategory, merchantSubcategory, reviewed: true },
    });

    return NextResponse.json({ appliedCount });
  } catch (err) {
    console.error("Failed to approve transaction", err);
    return NextResponse.json({ error: "Failed to approve" }, { status: 500 });
  }
}
