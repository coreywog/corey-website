"use client";

import { useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
import type { CalculatedMetricOption } from "./types";

type Aggregation = "sum" | "average" | "count" | "min" | "max" | "median" | "percentile" | "stddev" | "variance" | "range";
type MetricPeriod = "day" | "week" | "month" | "year";
type PeriodAggregation = "max" | "min" | "average" | "growth";

// Grouped rather than one flat list — the whole point of this session's
// redesign. "Basic" is what a CalculatedMetric could always do; the rest
// only exist because array-collect-then-reduce replaced the old streaming
// accumulator (see lib/dashboardQuery.ts's reduceValues).
const AGGREGATION_GROUPS: { label: string; options: { value: Aggregation; label: string }[] }[] = [
  {
    label: "Basic",
    options: [
      { value: "sum", label: "Sum" },
      { value: "count", label: "Count" },
      { value: "average", label: "Average" },
      { value: "min", label: "Minimum" },
      { value: "max", label: "Maximum" },
      { value: "range", label: "Range (max − min)" },
    ],
  },
  {
    label: "Statistical",
    options: [
      { value: "median", label: "Median" },
      { value: "percentile", label: "Percentile" },
      { value: "stddev", label: "Standard deviation" },
      { value: "variance", label: "Variance" },
    ],
  },
];
const PERCENTILE_OPTIONS = [25, 50, 75, 90, 95, 99] as const;
const PERIOD_OPTIONS: { value: MetricPeriod; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];
const PERIOD_AGGREGATION_OPTIONS: { value: PeriodAggregation; label: string }[] = [
  { value: "max", label: "Highest period" },
  { value: "min", label: "Lowest period" },
  { value: "average", label: "Average per period" },
  { value: "growth", label: "Growth (latest vs. previous)" },
];
const TRANSACTION_CATEGORY_OPTIONS = ["income", "spending", "transfer", "other"] as const;

const selectClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";
const labelClasses = "text-xs font-medium text-zinc-500 dark:text-zinc-400";

/**
 * Create-or-edit form for a saved CalculatedMetric — used both inline in
 * the widget editor's "+ New calculated metric…" flow and in Settings'
 * "Calculated metrics" management list (edit), so the field layout only
 * needs designing once. Passing `initial` switches this into edit mode
 * (PATCH instead of POST, pre-filled from the existing row).
 */
export function CalculatedMetricForm({
  initial,
  categoryOptions,
  onSaved,
  onCancel,
}: {
  initial?: CalculatedMetricOption;
  categoryOptions: { category: string; subcategory: string }[];
  onSaved: (metric: CalculatedMetricOption) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [aggregation, setAggregation] = useState<Aggregation>((initial?.aggregation as Aggregation) ?? "sum");
  const [percentile, setPercentile] = useState<number>(initial?.percentile ?? 50);
  const [transactionCategory, setTransactionCategory] = useState(initial?.transactionCategory ?? "");
  const [merchantCategories, setMerchantCategories] = useState<string[]>(initial?.merchantCategories ?? []);
  const [periodEnabled, setPeriodEnabled] = useState(Boolean(initial?.period));
  const [period, setPeriod] = useState<MetricPeriod>((initial?.period as MetricPeriod) ?? "month");
  const [periodAggregation, setPeriodAggregation] = useState<PeriodAggregation>((initial?.periodAggregation as PeriodAggregation) ?? "max");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = [...new Set(categoryOptions.map((c) => c.category))].sort();

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(initial ? `/api/dashboards/metrics/${initial.id}` : "/api/dashboards/metrics", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          aggregation,
          percentile: aggregation === "percentile" ? percentile : null,
          transactionCategory: transactionCategory || null,
          merchantCategories,
          period: periodEnabled ? period : null,
          periodAggregation: periodEnabled ? periodAggregation : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to save (${res.status}).`);
        return;
      }
      const body = await res.json();
      onSaved(body.metric);
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
      <span className={labelClasses}>{initial ? "Edit metric" : "New calculated metric"}</span>
      {!initial && <p className="text-[11px] text-zinc-500">Saved once, usable as the Metric on any widget from now on.</p>}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Average grocery trip)"
        maxLength={60}
        className={selectClasses}
      />

      <div className="flex flex-col gap-1.5">
        <span className={labelClasses}>What to measure</span>
        <div className="flex gap-1.5">
          <select value={aggregation} onChange={(e) => setAggregation(e.target.value as Aggregation)} className={selectClasses + " flex-1"}>
            {AGGREGATION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {aggregation === "percentile" && (
            <select value={percentile} onChange={(e) => setPercentile(Number(e.target.value))} className={selectClasses + " w-24"}>
              {PERCENTILE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}th
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={periodEnabled} onChange={(e) => setPeriodEnabled(e.target.checked)} />
          <span className="text-sm">Compare across time periods (e.g. &ldquo;highest-spending month&rdquo;)</span>
        </label>
        {periodEnabled && (
          <div className="flex gap-1.5 pl-6">
            <select value={period} onChange={(e) => setPeriod(e.target.value as MetricPeriod)} className={selectClasses}>
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={periodAggregation}
              onChange={(e) => setPeriodAggregation(e.target.value as PeriodAggregation)}
              className={selectClasses}
            >
              {PERIOD_AGGREGATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClasses}>Scope (optional)</span>
        <select value={transactionCategory} onChange={(e) => setTransactionCategory(e.target.value)} className={selectClasses}>
          <option value="">Any transaction type</option>
          {TRANSACTION_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} only
            </option>
          ))}
        </select>
        <SearchableSelect
          value=""
          onChange={(v) => setMerchantCategories((prev) => (prev.includes(v) ? prev : [...prev, v]))}
          options={categories.filter((c) => !merchantCategories.includes(c)).map((c) => ({ value: c, label: formatCategoryLabel(c) }))}
          placeholder="Add category…"
        />
        {merchantCategories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {merchantCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setMerchantCategories((prev) => prev.filter((x) => x !== c))}
                className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
              >
                {formatCategoryLabel(c)} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-black/[.1] px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {saving ? "Saving…" : "Save metric"}
        </button>
      </div>
    </div>
  );
}
