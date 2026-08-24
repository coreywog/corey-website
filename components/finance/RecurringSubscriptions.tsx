"use client";

import { useState } from "react";
import type { RecurringSubscription, SubscriptionStatus } from "@/lib/finance";
import { trailingMonths, formatMonthLabel } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatLastCharged(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

const GROUP_ORDER: SubscriptionStatus[] = ["active", "likely_cancelled", "single_charge"];

const GROUP_LABELS: Record<SubscriptionStatus, string> = {
  active: "Active",
  likely_cancelled: "Likely cancelled",
  single_charge: "Charged once",
};

const GROUP_HEADER_STYLES: Record<SubscriptionStatus, string> = {
  active: "text-emerald-600 dark:text-emerald-400 creamsicle:text-emerald-700",
  likely_cancelled: "text-zinc-400 dark:text-zinc-500 creamsicle:text-orange-400",
  single_charge: "text-amber-600 dark:text-amber-400 creamsicle:text-amber-700",
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      className={"h-3.5 w-3.5 shrink-0 transition-transform " + (open ? "rotate-90" : "")}
    >
      <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Every recurring subscription merchant, monthly cost, and a compact
 * month-by-month presence row — grouped by best-effort status (active,
 * then likely cancelled, then charged-once, each collapsible), and within
 * each group sorted by how many distinct months it's actually billed (most
 * consistent first). Hover a row for the exact last-charged date, hover a
 * dot for which month it is. See lib/finance.ts computeRecurringSubscriptions
 * for exactly how status is derived — it's inferred purely from billing
 * gaps, there's no actual "cancelled" flag anywhere in the source data.
 * Independent of whatever range the category explorer above is scoped to,
 * since "what am I subscribed to" shouldn't change when you zoom the trend
 * chart.
 */
export function RecurringSubscriptions({ subscriptions }: { subscriptions: RecurringSubscription[] }) {
  const [collapsed, setCollapsed] = useState<Set<SubscriptionStatus>>(new Set());

  if (subscriptions.length === 0) {
    return <p className="text-sm text-zinc-500">No recurring subscriptions found in the last 6 months.</p>;
  }

  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyAverage, 0);
  // Fixed 7-column window (6 trailing months + the current one) so every
  // row's dots line up under the same months regardless of that merchant's
  // own history.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const months = [...trailingMonths(6), currentMonth];

  const groups: Record<SubscriptionStatus, RecurringSubscription[]> = {
    active: [],
    likely_cancelled: [],
    single_charge: [],
  };
  for (const s of subscriptions) groups[s.status].push(s);

  function toggle(status: SubscriptionStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {currencyFormatter.format(monthlyTotal)}
        </span>{" "}
        / month across {subscriptions.length} subscription{subscriptions.length === 1 ? "" : "s"}
      </p>
      {GROUP_ORDER.map((status) => {
        const items = groups[status];
        if (items.length === 0) return null;
        const isOpen = !collapsed.has(status);
        return (
          <div key={status} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggle(status)}
              className={`flex items-center gap-1 text-xs font-semibold tracking-wide uppercase ${GROUP_HEADER_STYLES[status]}`}
            >
              <ChevronIcon open={isOpen} />
              {GROUP_LABELS[status]} ({items.length})
            </button>
            {isOpen && (
              <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08] creamsicle:divide-orange-100">
                {items.map((s) => {
                  const chargedSet = new Set(s.monthsCharged);
                  return (
                    <li
                      key={s.merchant}
                      title={`Last charged ${formatLastCharged(s.lastCharged)}`}
                      className="flex items-center gap-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{s.merchant}</span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        {months.map((m) => (
                          <span
                            key={m}
                            title={formatMonthLabel(m)}
                            className={
                              chargedSet.has(m)
                                ? "h-1.5 w-1.5 rounded-full bg-zinc-700 dark:bg-zinc-300 creamsicle:bg-orange-600"
                                : "h-1.5 w-1.5 rounded-full bg-black/[.08] dark:bg-white/[.12] creamsicle:bg-orange-100"
                            }
                          />
                        ))}
                      </span>
                      <span className="w-20 shrink-0 text-right font-medium">
                        {currencyFormatter.format(s.monthlyAverage)}/mo
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
