import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { FinanceTabs } from "@/components/finance/FinanceTabs";
import { DailyTransactionList } from "@/components/finance/DailyTransactionList";
import type { ReviewTxn } from "@/components/finance/TransactionReviewCard";

// Same account scope as the Overview tab, so a day's total here matches
// what that day contributed to the cash-flow chart.
const CASH_FLOW_ACCOUNT_TYPES = ["checking", "credit"];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const { date: requestedDate } = await searchParams;
  const isValidDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);

  // Same category/subcategory option set the Transaction Detail tab offers —
  // keeps the picker consistent no matter which tab you categorize from.
  // Doesn't depend on the date at all, so kick it off now and only await it
  // once the date-dependent chain below is settled, instead of adding a
  // fourth sequential round-trip after everything else.
  const categorizedPromise = prisma.transaction.findMany({
    where: {
      category: "spending",
      merchantCategory: { not: null, notIn: ["other"] },
      merchantSubcategory: { not: null },
    },
    select: { merchantCategory: true, merchantSubcategory: true },
    distinct: ["merchantCategory", "merchantSubcategory"],
  });

  let date = isValidDate ? requestedDate! : undefined;
  if (!date) {
    // Default to the most recent day with data, not "today" — today likely
    // has nothing posted yet.
    const latest = await prisma.transaction.findFirst({
      where: { account: { type: { in: CASH_FLOW_ACCOUNT_TYPES }, excludeFromCashFlow: false } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    date = latest ? isoDate(latest.date) : isoDate(new Date());
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const rawTxns = await prisma.transaction.findMany({
    where: {
      account: { type: { in: CASH_FLOW_ACCOUNT_TYPES }, excludeFromCashFlow: false },
      date: { gte: dayStart, lte: dayEnd },
    },
    include: { account: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  const categorized = await categorizedPromise;
  const categoryOptions = categorized
    .map((c) => ({ category: c.merchantCategory as string, subcategory: c.merchantSubcategory as string }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));

  const txns = rawTxns.map((t) => {
    const description = t.description ? decryptText(t.description) : "(no description)";
    const amount = decryptAmount(t.amount);
    if (t.category === "spending") {
      const txn: ReviewTxn = {
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        account: t.account.name,
        description,
        amount,
        rawName: t.rawName ? decryptText(t.rawName) : null,
        location: t.location ? decryptText(t.location) : null,
        website: t.website ? decryptText(t.website) : null,
        paymentChannel: t.paymentChannel,
        plaidDetailedCategory: t.plaidDetailedCategory,
        merchantCategory: t.merchantCategory,
        merchantSubcategory: t.merchantSubcategory,
        reviewed: t.reviewed,
      };
      return txn;
    }
    return { id: t.id, account: t.account.name, category: t.category, description, amount };
  });

  const spendingTotal = rawTxns
    .filter((t) => t.category === "spending")
    .reduce((sum, t) => sum + decryptAmount(t.amount), 0);
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <FinanceTabs current="/finance/daily" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/finance/daily?date=${prevDate}`}
            className="rounded-md border border-black/[.1] px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
          >
            ← Prev
          </Link>
          <form action="/finance/daily" method="GET" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={date}
              max={isoDate(new Date())}
              className="rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
            />
          </form>
          <Link
            href={`/finance/daily?date=${nextDate}`}
            className="rounded-md border border-black/[.1] px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
          >
            Next →
          </Link>
        </div>
        <span className="text-sm font-medium tabular-nums">
          {txns.length === 0 ? "No activity" : `$${Math.abs(spendingTotal).toFixed(2)} spent`}
        </span>
      </div>

      {txns.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing posted on {date}.</p>
      ) : (
        <DailyTransactionList transactions={txns} categoryOptions={categoryOptions} />
      )}
    </div>
  );
}
