import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const bodySchema = z
  .object({
    // subcategory omitted = every subcategory under this category moves.
    from: z.object({ category: z.string().trim().min(1), subcategory: z.string().trim().min(1).optional() }),
    // null = send back to "needs review" as unclassified, instead of a
    // specific destination.
    to: z
      .object({ category: z.string().trim().min(1).max(60), subcategory: z.string().trim().min(1).max(60) })
      .nullable(),
  })
  .refine((v) => !(v.to && v.to.category === v.from.category && v.to.subcategory === v.from.subcategory), {
    message: "Destination is the same as the source",
  });

/**
 * Categories/subcategories aren't their own rows — they're just whatever
 * strings sit on Transaction.merchantCategory/merchantSubcategory (see
 * lib/dashboardConfig.ts's comment on the same idea for dashboards). So
 * there's nothing to "delete": reassigning every transaction in a category
 * away from it *is* deleting it — with nothing left pointing at the old
 * name, it stops showing up anywhere (the Review sidebar's tree, dashboard
 * filters, etc.) on its own.
 *
 * Also repoints any MerchantCategoryRule aimed at the old category/
 * subcategory, so a future Plaid sync doesn't quietly resurrect it: moved
 * to the new category if one was given, deleted otherwise (an unclassified
 * destination has nothing sensible for a rule to point at).
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
  const { from, to } = parsed.data;

  const txnWhere = {
    category: "spending" as const,
    merchantCategory: from.category,
    ...(from.subcategory ? { merchantSubcategory: from.subcategory } : {}),
  };
  const ruleWhere = {
    merchantCategory: from.category,
    ...(from.subcategory ? { merchantSubcategory: from.subcategory } : {}),
  };

  try {
    const [txnResult] = await prisma.$transaction([
      prisma.transaction.updateMany({
        where: txnWhere,
        data: to
          ? // An explicit destination is itself a human decision — mark
            // reviewed, same convention as approving/rule-teaching elsewhere.
            { merchantCategory: to.category, merchantSubcategory: to.subcategory, reviewed: true }
          : { merchantCategory: null, merchantSubcategory: null, reviewed: false },
      }),
      to
        ? prisma.merchantCategoryRule.updateMany({
            where: ruleWhere,
            data: { merchantCategory: to.category, merchantSubcategory: to.subcategory },
          })
        : prisma.merchantCategoryRule.deleteMany({ where: ruleWhere }),
    ]);

    return NextResponse.json({ movedCount: txnResult.count });
  } catch (err) {
    console.error("Failed to reassign category", err);
    return NextResponse.json({ error: "Failed to reassign" }, { status: 500 });
  }
}
