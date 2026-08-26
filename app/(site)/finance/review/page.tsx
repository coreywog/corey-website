import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { FinanceTabs } from "@/components/finance/FinanceTabs";
import { ReviewQueue } from "@/components/finance/ReviewQueue";

export default async function ReviewPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  // The review queue: spending with no merchant category yet — everything
  // the static classifier (lib/merchantClassify.ts) and any saved rules
  // (lib/merchantRules.ts) failed to recognize.
  const rawPending = await prisma.transaction.findMany({
    // classifyMerchant's fallback (lib/merchantClassify.ts) stores the
    // literal string "other" for an unmatched merchant, not null — both
    // mean "needs review" and both display as "Other" on the category
    // chart (lib/finance.ts's `merchantCategory ?? "other"`).
    where: { category: "spending", OR: [{ merchantCategory: null }, { merchantCategory: "other" }] },
    include: { account: { select: { name: true } } },
    orderBy: { date: "desc" },
  });

  const pending = rawPending.map((t) => ({
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    account: t.account.name,
    description: t.description ? decryptText(t.description) : "(no description)",
    amount: decryptAmount(t.amount),
    // Only ever present for Plaid-synced rows — statement imports have no
    // equivalent data to backfill these from.
    rawName: t.rawName ? decryptText(t.rawName) : null,
    location: t.location ? decryptText(t.location) : null,
    paymentChannel: t.paymentChannel,
    plaidDetailedCategory: t.plaidDetailedCategory,
  }));

  // Existing category/subcategory pairs in use — what "current ones" means
  // in the picker, so corrections stay consistent with what's already there
  // rather than spawning near-duplicate categories.
  const categorized = await prisma.transaction.findMany({
    where: {
      category: "spending",
      merchantCategory: { not: null, notIn: ["other"] },
      merchantSubcategory: { not: null },
    },
    select: { merchantCategory: true, merchantSubcategory: true },
    distinct: ["merchantCategory", "merchantSubcategory"],
  });
  const categoryOptions = categorized
    .map((c) => ({ category: c.merchantCategory as string, subcategory: c.merchantSubcategory as string }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));

  const rules = await prisma.merchantCategoryRule.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16">
      <FinanceTabs current="/finance/review" />
      <ReviewQueue transactions={pending} categoryOptions={categoryOptions} rules={rules} />
    </div>
  );
}
