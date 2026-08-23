import type { RecurringSubscription } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function formatLastCharged(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

/** Every recurring subscription merchant, monthly cost, and when it last charged — independent of whatever range the category explorer above is scoped to, since "what am I subscribed to" shouldn't change when you zoom the trend chart. */
export function RecurringSubscriptions({ subscriptions }: { subscriptions: RecurringSubscription[] }) {
  if (subscriptions.length === 0) {
    return <p className="text-sm text-zinc-500">No recurring subscriptions found in the last 6 months.</p>;
  }

  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyAverage, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {currencyFormatter.format(monthlyTotal)}
        </span>{" "}
        / month across {subscriptions.length} subscription{subscriptions.length === 1 ? "" : "s"}
      </p>
      <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08] creamsicle:divide-orange-100">
        {subscriptions.map((s) => (
          <li key={s.merchant} className="flex items-center justify-between gap-4 py-2 text-sm">
            <div className="flex flex-col">
              <span className="font-medium">{s.merchant}</span>
              <span className="text-xs text-zinc-500">Last charged {formatLastCharged(s.lastCharged)}</span>
            </div>
            <span className="shrink-0 font-medium">{currencyFormatter.format(s.monthlyAverage)}/mo</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
