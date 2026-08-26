import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { buildReviewCategoryTree } from "@/lib/finance";
import { FinanceTabs } from "@/components/finance/FinanceTabs";
import { ReviewSidebar } from "@/components/finance/ReviewSidebar";
import { GlobalReviewList } from "@/components/finance/GlobalReviewList";
import { CategoryReviewView } from "@/components/finance/CategoryReviewView";
import { SavedRulesList } from "@/components/finance/SavedRulesList";
import type { ReviewTxn } from "@/components/finance/TransactionReviewCard";

type RawTxn = {
  id: string;
  date: Date;
  amount: string;
  description: string | null;
  rawName: string | null;
  location: string | null;
  website: string | null;
  paymentChannel: string | null;
  plaidDetailedCategory: string | null;
  merchantCategory: string | null;
  merchantSubcategory: string | null;
  reviewed: boolean;
  account: { name: string };
};

function decryptTxn(t: RawTxn): ReviewTxn {
  return {
    id: t.id,
    date: t.date.toISOString().slice(0, 10),
    account: t.account.name,
    description: t.description ? decryptText(t.description) : "(no description)",
    amount: decryptAmount(t.amount),
    rawName: t.rawName ? decryptText(t.rawName) : null,
    location: t.location ? decryptText(t.location) : null,
    website: t.website ? decryptText(t.website) : null,
    paymentChannel: t.paymentChannel,
    plaidDetailedCategory: t.plaidDetailedCategory,
    merchantCategory: t.merchantCategory,
    merchantSubcategory: t.merchantSubcategory,
    reviewed: t.reviewed,
  };
}

const TXN_INCLUDE = { account: { select: { name: true } } } as const;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subcategory?: string }>;
}) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const { category, subcategory } = await searchParams;

  // Sidebar tree — every categorized transaction, lightweight (no
  // description decryption needed just to count).
  const treeRows = await prisma.transaction.findMany({
    where: { category: "spending", merchantCategory: { not: null, notIn: ["other"] }, merchantSubcategory: { not: null } },
    select: { merchantCategory: true, merchantSubcategory: true, reviewed: true },
  });
  const tree = buildReviewCategoryTree(
    treeRows as { merchantCategory: string; merchantSubcategory: string; reviewed: boolean }[],
  );
  const categoryOptions = tree.flatMap((node) =>
    node.subcategories.map((s) => ({ category: node.category, subcategory: s.subcategory })),
  );

  const globalNeedsReview = await prisma.transaction.count({
    where: { category: "spending", reviewed: false },
  });

  const rules = await prisma.merchantCategoryRule.findMany({ orderBy: { createdAt: "desc" } });

  let mainContent;
  if (!category) {
    const rawPending = await prisma.transaction.findMany({
      where: { category: "spending", reviewed: false },
      include: TXN_INCLUDE,
      orderBy: { date: "desc" },
    });
    mainContent = (
      <GlobalReviewList transactions={rawPending.map(decryptTxn)} categoryOptions={categoryOptions} />
    );
  } else {
    const rawAll = await prisma.transaction.findMany({
      where: {
        category: "spending",
        merchantCategory: category,
        ...(subcategory ? { merchantSubcategory: subcategory } : {}),
      },
      include: TXN_INCLUDE,
      orderBy: { date: "desc" },
    });
    const all = rawAll.map(decryptTxn);
    mainContent = (
      <CategoryReviewView
        needsReview={all.filter((t) => !t.reviewed)}
        approved={all.filter((t) => t.reviewed)}
        categoryOptions={categoryOptions}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-16">
      <FinanceTabs current="/finance/review" />
      <div className="flex gap-6">
        <ReviewSidebar tree={tree} globalNeedsReview={globalNeedsReview} />
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {mainContent}
          <SavedRulesList rules={rules} />
        </div>
      </div>
    </div>
  );
}
