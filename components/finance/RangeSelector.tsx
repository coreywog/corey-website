"use client";

import type { DateRangeSelection } from "@/lib/finance";
import { formatMonthLabel } from "@/lib/finance";

const RELATIVE_OPTIONS: { months: 1 | 3 | 6; label: string }[] = [
  { months: 1, label: "1 month" },
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
];

/** Rolling-window buttons (1/3/6 months) plus a specific-month dropdown as a fourth option — shared by DailyCashFlowChart and SpendingExplorer so both behave identically. */
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
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-full border border-black/[.08] p-0.5 dark:border-white/[.1] creamsicle:border-orange-200">
        {RELATIVE_OPTIONS.map((r) => (
          <button
            key={r.months}
            type="button"
            onClick={() => onChange({ mode: "relative", months: r.months })}
            className={
              value.mode === "relative" && value.months === r.months
                ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
                : "rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 creamsicle:hover:text-orange-800"
            }
          >
            {r.label}
          </button>
        ))}
      </div>
      {availableMonths.length > 0 && (
        <>
          <span className="text-xs text-zinc-400">or</span>
          <select
            value={value.mode === "specific" ? value.month : ""}
            onChange={(e) => {
              if (e.target.value) onChange({ mode: "specific", month: e.target.value });
            }}
            className="rounded-md border border-black/[.1] bg-white px-2 py-1 text-xs outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-200 creamsicle:bg-white"
          >
            <option value="" disabled>
              Pick a month
            </option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}
