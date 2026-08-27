import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import {
  computeMonthlyCashFlow,
  computeDailyCashFlow,
  monthRange,
  trailingMonths,
} from "@/lib/finance";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { FinanceTabs } from "@/components/finance/FinanceTabs";
import { DailyCashFlowChart } from "@/components/finance/DailyCashFlowChart";
import { MonthRecapCard } from "@/components/finance/MonthRecapCard";
import { SpendingExplorer } from "@/components/finance/SpendingExplorer";

// Investment accounts (Schwab) are excluded from cash flow — only
// checking/credit accounts (Chase, Amex) reflect actual income and spending.
const CASH_FLOW_ACCOUNT_TYPES = ["checking", "credit"];

export default async function FinancePage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  // The recap cards below need every one of trailingMonths(6)'s calendar
  // months in full — the query floor has to be the *start* of the oldest
  // one (trailingMonths returns oldest-first), not a rolling
  // today-minus-6-months day-count. That rolling cutoff lands mid-month
  // (e.g. Feb 27, not Feb 1), which silently fed the oldest recap card only
  // its last couple of days of data — a real bug, not a rounding quirk;
  // confirmed by hand against the raw decrypted transactions.
  const recapMonthKeys = trailingMonths(6);
  const earliestMonthStart = monthRange(recapMonthKeys[0]).start;
  const rawRecentTxns = await prisma.transaction.findMany({
    where: {
      // excludeFromCashFlow: PayPal-style accounts that charge a linked
      // card directly duplicate that card's own transactions (see
      // prisma/schema.prisma) — left out here so spending isn't doubled.
      account: { type: { in: CASH_FLOW_ACCOUNT_TYPES }, excludeFromCashFlow: false },
      date: { gte: earliestMonthStart },
    },
    select: {
      date: true,
      amount: true,
      category: true,
      merchantCategory: true,
      merchantSubcategory: true,
      description: true,
    },
    orderBy: { date: "asc" },
  });

  // Amounts and descriptions are encrypted at rest (see lib/crypto.ts) —
  // decrypt once here, never persisted or logged in plaintext.
  const recentTxns = rawRecentTxns.map((t) => ({
    ...t,
    amount: decryptAmount(t.amount),
    description: t.description ? decryptText(t.description) : null,
  }));

  const dailySeries = computeDailyCashFlow(recentTxns);

  // Trailing 6 calendar months (not the in-progress current month), oldest
  // first — always all 6, even if a month had zero activity.
  const recapMonths = recapMonthKeys.map((month) => {
    const { start, end } = monthRange(month);
    const monthTxns = recentTxns.filter((t) => t.date >= start && t.date < end);
    return { month, ...computeMonthlyCashFlow(monthTxns) };
  });

  // SpendingExplorer is a client component doing its own range filtering
  // and drill-down aggregation — hand it plain date strings, matching every
  // other date field that already crosses the server/client boundary here.
  const explorerTxns = recentTxns.map((t) => ({
    ...t,
    date: t.date.toISOString().slice(0, 10),
  }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-16">
      <FinanceTabs current="/finance" />

      <div className="flex flex-col gap-3">
        <DailyCashFlowChart data={dailySeries} />
        <p className="text-xs text-zinc-500 creamsicle:text-orange-600">
          Chase + Amex only, excludes investment accounts and transfers
          between your own accounts (savings, card payments).
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Monthly recap
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {recapMonths.map((m) => (
            <MonthRecapCard
              key={m.month}
              month={m.month}
              income={m.income}
              spending={m.spending}
              net={m.net}
            />
          ))}
        </div>
      </div>

      <SpendingExplorer transactions={explorerTxns} />
    </div>
  );
}
