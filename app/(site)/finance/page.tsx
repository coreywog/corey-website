import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import {
  computeMonthlyCashFlow,
  computeDailyCashFlow,
  computeSpendingByCategory,
  listAvailableMonths,
  monthRange,
  monthsAgo,
} from "@/lib/finance";
import { decryptAmount } from "@/lib/crypto";
import { CashFlowChart } from "@/components/finance/CashFlowChart";
import { DailyCashFlowChart } from "@/components/finance/DailyCashFlowChart";
import { CategoryBreakdown } from "@/components/finance/CategoryBreakdown";
import { MonthSelector } from "@/components/finance/MonthSelector";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Investment accounts (Schwab) are excluded from cash flow — only
// checking/credit accounts (Chase, Amex) reflect actual income and spending.
const CASH_FLOW_ACCOUNT_TYPES = ["checking", "credit"];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const sixMonthsAgo = monthsAgo(6);
  const rawRecentTxns = await prisma.transaction.findMany({
    where: {
      account: { type: { in: CASH_FLOW_ACCOUNT_TYPES } },
      date: { gte: sixMonthsAgo },
    },
    select: { date: true, amount: true, category: true, merchantCategory: true },
    orderBy: { date: "asc" },
  });

  // Amounts are encrypted at rest (see lib/crypto.ts) — decrypt once here,
  // never persisted or logged in plaintext.
  const recentTxns = rawRecentTxns.map((t) => ({
    ...t,
    amount: decryptAmount(t.amount),
  }));

  const dailySeries = computeDailyCashFlow(recentTxns);

  const availableMonths = listAvailableMonths(recentTxns.map((t) => t.date));
  const { month: requestedMonth } = await searchParams;
  const selectedMonth =
    requestedMonth && availableMonths.includes(requestedMonth)
      ? requestedMonth
      : availableMonths[0];

  let cashFlow = { income: 0, spending: 0, net: 0 };
  let categoryTotals: ReturnType<typeof computeSpendingByCategory> = [];
  if (selectedMonth) {
    const { start, end } = monthRange(selectedMonth);
    const monthTxns = recentTxns.filter((t) => t.date >= start && t.date < end);
    cashFlow = computeMonthlyCashFlow(monthTxns);
    categoryTotals = computeSpendingByCategory(monthTxns);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Finances</h1>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
          Last 6 months
        </h2>
        <DailyCashFlowChart data={dailySeries} />
        <p className="text-xs text-zinc-500">
          Chase + Amex only, excludes investment accounts and transfers
          between your own accounts (savings, card payments).
        </p>
      </div>

      {selectedMonth && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
              Monthly cash flow
            </h2>
            <MonthSelector months={availableMonths} selected={selectedMonth} />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-sm text-zinc-500">
              {cashFlow.net >= 0 ? "Ahead" : "Behind"} by
            </span>
            <span
              className={
                cashFlow.net >= 0
                  ? "text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400"
                  : "text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400"
              }
            >
              {currencyFormatter.format(Math.abs(cashFlow.net))}
            </span>
          </div>
          <CashFlowChart income={cashFlow.income} spending={cashFlow.spending} />

          <div className="flex flex-col gap-3 border-t border-black/[.08] pt-4 dark:border-white/[.1]">
            <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
              Spending by category
            </h3>
            <CategoryBreakdown totals={categoryTotals} />
            <p className="text-xs text-zinc-500">
              Best-effort classification from merchant names — not perfect.
              Anything unrecognized lands in &quot;Other&quot;.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
