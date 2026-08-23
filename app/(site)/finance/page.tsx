import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import {
  computeNetWorthSeries,
  computeMonthlyCashFlow,
  listAvailableMonths,
  monthRange,
} from "@/lib/finance";
import { decryptAmount } from "@/lib/crypto";
import { NetWorthChart } from "@/components/finance/NetWorthChart";
import { CashFlowChart } from "@/components/finance/CashFlowChart";
import { MonthSelector } from "@/components/finance/MonthSelector";
import { BalanceForm } from "@/components/admin/BalanceForm";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// Investment accounts (Schwab) are excluded from monthly cash flow — only
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

  const [accounts, rawEntries, cashFlowDates] = await Promise.all([
    prisma.financeAccount.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.balanceEntry.findMany({ orderBy: { date: "asc" } }),
    prisma.transaction.findMany({
      where: { account: { type: { in: CASH_FLOW_ACCOUNT_TYPES } } },
      select: { date: true },
    }),
  ]);

  // Balances are encrypted at rest (see lib/crypto.ts) — decrypt once here,
  // never persisted or logged in plaintext.
  const entries = rawEntries.map((entry) => ({
    ...entry,
    balance: decryptAmount(entry.balance),
  }));

  const series = computeNetWorthSeries(accounts, entries);
  const currentNetWorth = series.at(-1)?.netWorth ?? 0;

  const latestByAccount = new Map<string, number>();
  for (const entry of entries) {
    latestByAccount.set(entry.accountId, entry.balance);
  }

  const availableMonths = listAvailableMonths(cashFlowDates.map((d) => d.date));
  const { month: requestedMonth } = await searchParams;
  const selectedMonth =
    requestedMonth && availableMonths.includes(requestedMonth)
      ? requestedMonth
      : availableMonths[0];

  let cashFlow = { income: 0, spending: 0, net: 0 };
  if (selectedMonth) {
    const { start, end } = monthRange(selectedMonth);
    const rawMonthTxns = await prisma.transaction.findMany({
      where: {
        account: { type: { in: CASH_FLOW_ACCOUNT_TYPES } },
        date: { gte: start, lt: end },
      },
      select: { amount: true, category: true },
    });
    const monthTxns = rawMonthTxns.map((t) => ({
      ...t,
      amount: decryptAmount(t.amount),
    }));
    cashFlow = computeMonthlyCashFlow(monthTxns);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Finances</h1>

      <div className="flex flex-col gap-4">
        <div>
          <div className="text-sm text-zinc-500">Net worth</div>
          <div className="text-3xl font-semibold tracking-tight">
            {currencyFormatter.format(currentNetWorth)}
          </div>
        </div>
        <NetWorthChart data={series} />
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
          <p className="text-xs text-zinc-500">
            Chase + Amex only, excludes investment accounts. Income counts
            deposits from Amazon/Whole Foods; transfers between your own
            accounts (savings, card payments) are excluded from spending.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
          Accounts
        </h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No accounts yet — add one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between rounded-md border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.1]"
              >
                <span>
                  {account.name}{" "}
                  <span className="text-zinc-500">({account.type})</span>
                </span>
                <span className="font-medium">
                  {latestByAccount.has(account.id)
                    ? currencyFormatter.format(latestByAccount.get(account.id)!)
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
          Log balances
        </h2>
        <BalanceForm accounts={accounts} />
      </div>
    </div>
  );
}
