"use client";

import type { DateRangeSelection } from "@/lib/finance";
import { formatMonthLabel } from "@/lib/finance";

const RELATIVE_OPTIONS: { months: 1 | 3 | 6; label: string }[] = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
];

const ACTIVE_PILL =
  "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white";
const INACTIVE_PILL =
  "rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 creamsicle:hover:text-orange-800";

/** Rolling-window buttons (1/3/6 months) plus a specific-month dropdown, all one pill group — shared by DailyCashFlowChart and SpendingExplorer so both behave identically. */
export function RangeSelector({
  value,
  onChange,
  availableMonths,
}: {
  value: DateRangeSelection;
  onChange: (next: DateRangeSelection) => void;
  availableMonths: string[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-black/[.08] p-0.5 dark:border-white/[.1] creamsicle:border-orange-200">
      {RELATIVE_OPTIONS.map((r) => (
        <button
          key={r.months}
          type="button"
          onClick={() => onChange({ mode: "relative", months: r.months })}
          className={value.mode === "relative" && value.months === r.months ? ACTIVE_PILL : INACTIVE_PILL}
        >
          {r.label}
        </button>
      ))}
      {availableMonths.length > 0 && (
        <div className="relative">
          <select
            value={value.mode === "specific" ? value.month : ""}
            onChange={(e) => {
              if (e.target.value) onChange({ mode: "specific", month: e.target.value });
            }}
            className={
              "cursor-pointer appearance-none bg-transparent pr-5 pl-3 outline-none " +
              (value.mode === "specific" ? ACTIVE_PILL : INACTIVE_PILL)
            }
          >
            <option value="" disabled className="text-zinc-900 dark:text-zinc-100">
              Month
            </option>
            {availableMonths.map((m) => (
              <option key={m} value={m} className="text-zinc-900 dark:text-zinc-100">
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            className={
              "pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 " +
              (value.mode === "specific" ? "text-white dark:text-zinc-900 creamsicle:text-white" : "text-current")
            }
          >
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
