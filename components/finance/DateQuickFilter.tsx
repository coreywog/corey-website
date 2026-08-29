"use client";

// Shared by GlobalReviewList and CategoryReviewView: a row of one-click
// buttons for the last week of calendar days, plus a plain date input for
// anything older. Deliberately fluid, like the dashboard widget date
// filters — isoDaysAgo/shortLabel recompute from `new Date()` on every
// render rather than baking in a frozen date, so "Today" still means today
// if this stays open past midnight.
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function shortLabel(n: number): string {
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

const LAST_WEEK = Array.from({ length: 7 }, (_, i) => i);

export function DateQuickFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (date: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LAST_WEEK.map((n) => {
        const iso = isoDaysAgo(n);
        const active = value === iso;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : iso)}
            className={
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors " +
              (active
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
                : "bg-black/[.05] text-zinc-600 hover:bg-black/[.1] dark:bg-white/[.08] dark:text-zinc-300 dark:hover:bg-white/[.14] creamsicle:bg-orange-100 creamsicle:text-orange-700 creamsicle:hover:bg-orange-200")
            }
          >
            {shortLabel(n)}
          </button>
        );
      })}
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border border-black/[.1] bg-white px-2 py-1 text-xs outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Clear
        </button>
      )}
    </div>
  );
}
