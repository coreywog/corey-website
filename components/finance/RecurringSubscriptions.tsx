import type { RecurringSubscription } from "@/lib/finance";
import { trailingMonths, formatMonthLabel } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatLastCharged(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

const STATUS_STYLES: Record<
  RecurringSubscription["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 creamsicle:bg-emerald-100 creamsicle:text-emerald-700",
  },
  likely_cancelled: {
    label: "Likely cancelled",
    className:
      "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 creamsicle:bg-orange-100 creamsicle:text-orange-500",
  },
  single_charge: {
    label: "Charged once",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 creamsicle:bg-amber-100 creamsicle:text-amber-700",
  },
};

/**
 * Every recurring subscription merchant, monthly cost, a best-effort
 * active/cancelled status, and a month-by-month presence row so you can
 * see the pattern behind that status yourself (see
 * lib/finance.ts computeRecurringSubscriptions for exactly how status is
 * derived — it's inferred purely from billing gaps, there's no actual
 * "cancelled" flag anywhere in the source data). Independent of whatever
 * range the category explorer above is scoped to, since "what am I
 * subscribed to" shouldn't change when you zoom the trend chart.
 */
export function RecurringSubscriptions({ subscriptions }: { subscriptions: RecurringSubscription[] }) {
  if (subscriptions.length === 0) {
    return <p className="text-sm text-zinc-500">No recurring subscriptions found in the last 6 months.</p>;
  }

  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyAverage, 0);
  // Fixed 7-column window (6 trailing months + the current one) so every
  // row's dots line up under the same months regardless of that merchant's
  // own history.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const months = [...trailingMonths(6), currentMonth];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {currencyFormatter.format(monthlyTotal)}
        </span>{" "}
        / month across {subscriptions.length} subscription{subscriptions.length === 1 ? "" : "s"}
      </p>
      <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08] creamsicle:divide-orange-100">
        {subscriptions.map((s) => {
          const status = STATUS_STYLES[s.status];
          const chargedSet = new Set(s.monthsCharged);
          return (
            <li key={s.merchant} className="flex flex-col gap-1.5 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="font-medium">{s.merchant}</span>
                  <span className="text-xs text-zinc-500">Last charged {formatLastCharged(s.lastCharged)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                  <span className="font-medium">{currencyFormatter.format(s.monthlyAverage)}/mo</span>
                </div>
              </div>
              <div className="flex items-center gap-1" title="One dot per month — filled means charged that month">
                {months.map((m) => (
                  <span
                    key={m}
                    title={formatMonthLabel(m)}
                    className={
                      chargedSet.has(m)
                        ? "h-2 w-2 rounded-full bg-zinc-700 dark:bg-zinc-300 creamsicle:bg-orange-600"
                        : "h-2 w-2 rounded-full bg-black/[.08] dark:bg-white/[.12] creamsicle:bg-orange-100"
                    }
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
