import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { buildReviewCategoryTree } from "@/lib/finance";
import { ReviewSidebar } from "@/components/finance/ReviewSidebar";
import { GlobalReviewList } from "@/components/finance/GlobalReviewList";
import { CategoryReviewView } from "@/components/finance/CategoryReviewView";
import { DatasetTable } from "@/components/dataHub/DatasetTable";
import { UploadDatasetForm } from "@/components/dataHub/UploadDatasetForm";
import { DeleteDatasetButton } from "@/components/dataHub/DeleteDatasetButton";
import type { ReviewTxn } from "@/components/finance/TransactionReviewCard";
import { DatasetColumnsSchema } from "@/lib/datasetCsv";

// Bounds how much a single tab has to decrypt+render — see
// app/api/data-hub/datasets/route.ts's MAX_ROWS for the matching upload
// cap. Real pagination is a fast-follow, not v1; this keeps the worst case
// predictable in the meantime rather than unbounded.
const DATASET_ROW_DISPLAY_CAP = 500;

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

const tabLinkClasses = (active: boolean) =>
  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
  (active
    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
    : "text-zinc-500 hover:bg-black/[.05] dark:text-zinc-400 dark:hover:bg-white/[.08] creamsicle:text-orange-600 creamsicle:hover:bg-orange-50");

/**
 * Data Management — one tab per connected data source. Finance
 * (Plaid-backed transactions) is one tab among others, shown only once
 * there's actually an account connected; every uploaded dataset gets its
 * own. Deliberately all server-rendered, tab switching via plain links
 * (?tab=) rather than client-side state: only the active tab's data is
 * ever fetched or decrypted, so adding tabs/datasets never costs anything
 * on a page load that isn't looking at them.
 */
export default async function DataHubPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; category?: string; subcategory?: string }>;
}) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const { tab, category, subcategory } = await searchParams;

  const [financeAccountCount, datasets] = await Promise.all([
    prisma.financeAccount.count({ where: { archived: false } }),
    prisma.dataset.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, columns: true, _count: { select: { rows: true } } },
    }),
  ]);
  const showFinanceTab = financeAccountCount > 0;
  const datasetIds = new Set(datasets.map((d) => d.id));
  const activeTab: string | null = tab && (tab === "finance" ? showFinanceTab : datasetIds.has(tab))
    ? tab
    : showFinanceTab
      ? "finance"
      : (datasets[0]?.id ?? null);

  let tabContent: React.ReactNode = (
    <p className="text-sm text-zinc-500">
      Nothing to show yet — connect a bank in Settings, or upload a dataset above.
    </p>
  );

  if (activeTab === "finance") {
    // Same query shape as the old Transaction Detail page — parallelized,
    // since these three don't depend on each other.
    const [treeRows, globalNeedsReview, rawRows] = await Promise.all([
      prisma.transaction.findMany({
        where: { category: "spending", merchantCategory: { not: null, notIn: ["other"] }, merchantSubcategory: { not: null } },
        select: { merchantCategory: true, merchantSubcategory: true, reviewed: true },
      }),
      prisma.transaction.count({ where: { category: "spending", reviewed: false } }),
      category
        ? prisma.transaction.findMany({
            where: {
              category: "spending",
              merchantCategory: category,
              ...(subcategory ? { merchantSubcategory: subcategory } : {}),
            },
            include: TXN_INCLUDE,
            orderBy: { date: "desc" },
          })
        : prisma.transaction.findMany({
            where: { category: "spending", reviewed: false },
            include: TXN_INCLUDE,
            orderBy: { date: "desc" },
          }),
    ]);

    const tree = buildReviewCategoryTree(
      treeRows as { merchantCategory: string; merchantSubcategory: string; reviewed: boolean }[],
    );
    const categoryOptions = tree.flatMap((node) =>
      node.subcategories.map((s) => ({ category: node.category, subcategory: s.subcategory })),
    );

    let mainContent;
    if (!category) {
      mainContent = <GlobalReviewList transactions={rawRows.map(decryptTxn)} categoryOptions={categoryOptions} />;
    } else {
      const all = rawRows.map(decryptTxn);
      mainContent = (
        <CategoryReviewView
          needsReview={all.filter((t) => !t.reviewed)}
          approved={all.filter((t) => t.reviewed)}
          categoryOptions={categoryOptions}
        />
      );
    }

    tabContent = (
      <div className="flex gap-6">
        <ReviewSidebar tree={tree} globalNeedsReview={globalNeedsReview} />
        <div className="flex min-w-0 flex-1 flex-col gap-8">{mainContent}</div>
      </div>
    );
  } else if (activeTab) {
    const dataset = datasets.find((d) => d.id === activeTab);
    if (dataset) {
      const rawRows = await prisma.datasetRow.findMany({
        where: { datasetId: activeTab },
        orderBy: { createdAt: "asc" },
        take: DATASET_ROW_DISPLAY_CAP,
        select: { data: true },
      });
      const rows = rawRows.map((r) => JSON.parse(decryptText(r.data)) as Record<string, string>);
      const parsedColumns = DatasetColumnsSchema.safeParse(dataset.columns);
      tabContent = (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{dataset.name}</h2>
            <DeleteDatasetButton datasetId={dataset.id} name={dataset.name} />
          </div>
          {parsedColumns.success ? (
            <DatasetTable
              columns={parsedColumns.data}
              rows={rows}
              totalCount={dataset._count.rows}
              shown={rows.length}
            />
          ) : (
            <p className="text-sm text-red-600 dark:text-red-400">This dataset&apos;s column info is out of date.</p>
          )}
        </div>
      );
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Data Management</h1>

      <div className="flex flex-wrap items-center gap-2">
        {showFinanceTab && (
          <Link href="/data-hub?tab=finance" className={tabLinkClasses(activeTab === "finance")}>
            Finance
          </Link>
        )}
        {datasets.map((d) => (
          <Link key={d.id} href={`/data-hub?tab=${d.id}`} className={tabLinkClasses(activeTab === d.id)}>
            {d.name}
          </Link>
        ))}
        <UploadDatasetForm />
      </div>

      {tabContent}
    </div>
  );
}
