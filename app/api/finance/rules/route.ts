import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/auth";
import { saveRuleAndApply } from "@/lib/merchantRules";

const bodySchema = z.object({
  pattern: z.string().trim().min(1).max(200),
  merchantCategory: z.string().trim().min(1).max(60),
  merchantSubcategory: z.string().trim().min(1).max(60),
});

/**
 * Saves a merchant->category correction from the Review tab
 * (app/(site)/finance/review) and immediately applies it to every existing
 * matching transaction — see lib/merchantRules.ts. Future Plaid syncs check
 * these rules ahead of the static classifier (lib/plaidSync.ts).
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
    const appliedCount = await saveRuleAndApply(
      parsed.data.pattern,
      parsed.data.merchantCategory,
      parsed.data.merchantSubcategory,
    );
    return NextResponse.json({ appliedCount });
  } catch (err) {
    console.error("Failed to save merchant rule", err);
    return NextResponse.json({ error: "Failed to save rule" }, { status: 500 });
  }
}
