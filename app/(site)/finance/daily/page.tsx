import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { FinanceTabs } from "@/components/finance/FinanceTabs";

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

function formatAmount(amount: number) {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
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

  const txns = rawTxns.map((t) => ({
    id: t.id,
    account: t.account.name,
    category: t.category,
    merchantCategory: t.merchantCategory,
    merchantSubcategory: t.merchantSubcategory,
    description: t.description ? decryptText(t.description) : "(no description)",
    amount: decryptAmount(t.amount),
  }));

  const spendingTotal = txns.filter((t) => t.category === "spending").reduce((sum, t) => sum + t.amount, 0);
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
        <div className="flex flex-col gap-1.5">
          {txns.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-md border border-black/[.06] px-3 py-2.5 dark:border-white/[.08]"
            >
              <div className="flex min-w-0 flex-1 items-baseline gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{t.description}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {t.merchantCategory ? `${t.merchantCategory} / ${t.merchantSubcategory}` : t.category}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{t.account}</span>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">{formatAmount(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
