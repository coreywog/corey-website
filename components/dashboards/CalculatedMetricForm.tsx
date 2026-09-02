"use client";

import { useEffect, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
import { InfoTip } from "./InfoTip";
import type { CalculatedMetricOption } from "./types";

export type Aggregation = "sum" | "average" | "count" | "min" | "max" | "median" | "percentile" | "stddev" | "variance" | "range";
export type MetricPeriod = "day" | "week" | "month" | "year";
export type PeriodAggregation = "max" | "min" | "average" | "growth";

// The live-preview-relevant subset of a metric's fields — everything
// `computeDraftMetricPreview` (lib/dashboardQuery.ts) needs, reported up on
// every change so a parent (MetricBuilderPanel) can drive a debounced
// preview fetch without owning any of this form's field state itself. Name
// is excluded — the preview doesn't care what the metric is called.
export type DraftMetricFields = {
  aggregation: Aggregation;
  percentile: number | null;
  transactionCategory: string | null;
  merchantCategories: string[];
  period: MetricPeriod | null;
  periodAggregation: PeriodAggregation | null;
};

// Grouped rather than one flat list — the whole point of this session's
// redesign. "Basic" is what a CalculatedMetric could always do; the rest
// only exist because array-collect-then-reduce replaced the old streaming
// accumulator (see lib/dashboardQuery.ts's reduceValues).
const AGGREGATION_GROUPS: { label: string; options: { value: Aggregation; label: string; help: string }[] }[] = [
  {
    label: "Basic",
    options: [
      { value: "sum", label: "Sum", help: "Adds up every matching transaction's amount." },
      { value: "count", label: "Count", help: "Counts how many matching transactions there are — not their dollar amount." },
      {
        value: "average",
        label: "Average",
        help: "Total ÷ number of transactions. One big purchase can pull this up a lot.",
      },
      { value: "min", label: "Minimum", help: "The single smallest matching transaction." },
      { value: "max", label: "Maximum", help: "The single largest matching transaction." },
      {
        value: "range",
        label: "Range (max − min)",
        help: "The gap between your smallest and largest matching transaction — a quick sense of how spread out your amounts are.",
      },
    ],
  },
  {
    label: "Statistical",
    options: [
      {
        value: "median",
        label: "Median",
        help: "The middle value when every matching transaction is sorted small to large. Less thrown off by one huge outlier than Average is.",
      },
      {
        value: "percentile",
        label: "Percentile",
        help: "The value below which N% of your matching transactions fall. 90th percentile = 90% of transactions were smaller than this.",
      },
      {
        value: "stddev",
        label: "Standard deviation",
        help: "How much your transaction amounts typically vary from the average. Small = most transactions are close in size; large = they swing widely.",
      },
      {
        value: "variance",
        label: "Variance",
        help: "The same idea as standard deviation, but in squared units — mostly useful as a building block. Standard deviation is usually the more readable choice.",
      },
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
const PERIOD_AGGREGATION_OPTIONS: { value: PeriodAggregation; label: string; help: string }[] = [
  { value: "max", label: "Highest period", help: "The single period (day/week/month/year) with the largest combined value — e.g. your highest-spending month." },
  { value: "min", label: "Lowest period", help: "The single period with the smallest combined value." },
  {
    value: "average",
    label: "Average per period",
    help: "Averages the per-period totals themselves — e.g. “average monthly spending,” not “average per transaction.”",
  },
  {
    value: "growth",
    label: "Growth (latest vs. previous)",
    help: "Percent change between only the two most recent periods — e.g. this month vs. last month. Doesn't look further back than that.",
  },
];
const TRANSACTION_CATEGORY_OPTIONS = ["income", "spending", "transfer", "other"] as const;

const selectClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";
const labelClasses = "text-xs font-medium text-zinc-500 dark:text-zinc-400";

/**
 * Create-or-edit form for a saved CalculatedMetric — used both by the
 * widget editor's metric builder (MetricBuilderPanel, `layout="panel"`) and
 * Settings' "Calculated metrics" management list (`layout="compact"`, the
 * default), so the field layout and — importantly — the plain-language help
 * copy only need designing once. Passing `initial` switches this into edit
 * mode (PATCH instead of POST, pre-filled from the existing row).
 */
export function CalculatedMetricForm({
  initial,
  categoryOptions,
  layout = "compact",
  onSaved,
  onCancel,
  onDraftChange,
}: {
  initial?: CalculatedMetricOption;
  categoryOptions: { category: string; subcategory: string }[];
  layout?: "compact" | "panel";
  onSaved: (metric: CalculatedMetricOption) => void;
  onCancel: () => void;
  onDraftChange?: (draft: DraftMetricFields) => void;
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

  // Reports the preview-relevant fields up on every change — see
  // DraftMetricFields' own comment. Re-firing with unchanged values on an
  // unrelated re-render is harmless (the parent's own preview-fetch effect
  // keys off these primitive values, not object identity or call count).
  useEffect(() => {
    onDraftChange?.({
      aggregation,
      percentile: aggregation === "percentile" ? percentile : null,
      transactionCategory: transactionCategory || null,
      merchantCategories,
      period: periodEnabled ? period : null,
      periodAggregation: periodEnabled ? periodAggregation : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDraftChange's identity isn't a meaningful dependency, only the field values are.
  }, [aggregation, percentile, transactionCategory, merchantCategories, periodEnabled, period, periodAggregation]);

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

  const selectedAggregation = AGGREGATION_GROUPS.flatMap((g) => g.options).find((o) => o.value === aggregation);

  const fields = (
    <>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Average grocery trip)"
        maxLength={60}
        className={selectClasses}
      />
      {!initial && layout === "compact" && <p className="text-[11px] text-zinc-500">Saved once, usable as the Metric on any widget from now on.</p>}

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
          <InfoTip label={selectedAggregation?.label ?? "this aggregation"}>{selectedAggregation?.help}</InfoTip>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={periodEnabled} onChange={(e) => setPeriodEnabled(e.target.checked)} />
          <span className="text-sm">Compare across time periods (e.g. &ldquo;highest-spending month&rdquo;)</span>
        </label>
        {periodEnabled && (
          <div className="flex flex-col gap-1.5 pl-6">
            {/* Always visible, not gated behind a click — this is the single
                most important thing to explain up front, since silently
                combining this with a widget's own Group By is exactly what
                produced the confusing "$917 — 2026-07-14" result this
                builder was built to prevent. */}
            <p className="text-[11px] text-zinc-500">
              This bucket-and-combine happens inside the metric itself — it&rsquo;s unrelated to a widget&rsquo;s own &ldquo;Group by&rdquo; field,
              and replaces it if the widget has one set. The two aren&rsquo;t meant to be combined.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
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
              <InfoTip label={PERIOD_AGGREGATION_OPTIONS.find((o) => o.value === periodAggregation)?.label ?? "this"}>
                {PERIOD_AGGREGATION_OPTIONS.find((o) => o.value === periodAggregation)?.help}
              </InfoTip>
            </div>
            <p className="text-[11px] text-zinc-500">
              How wide each bucket is — e.g. &ldquo;Month&rdquo; means every calendar month gets its own number before they&rsquo;re combined above.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClasses}>Scope (optional)</span>
        <div className="flex items-center gap-1.5">
          <select value={transactionCategory} onChange={(e) => setTransactionCategory(e.target.value)} className={selectClasses + " flex-1"}>
            <option value="">Any transaction type</option>
            {TRANSACTION_CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c} only
              </option>
            ))}
          </select>
          <InfoTip label="transaction type">A broad split every transaction already has (income, spending, transfer, other).</InfoTip>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <SearchableSelect
              value=""
              onChange={(v) => setMerchantCategories((prev) => (prev.includes(v) ? prev : [...prev, v]))}
              options={categories.filter((c) => !merchantCategories.includes(c)).map((c) => ({ value: c, label: formatCategoryLabel(c) }))}
              placeholder="Add category…"
            />
          </div>
          <InfoTip label="merchant category">
            A finer label like Groceries or Subscriptions. Independent of transaction type above — you can combine both (e.g. spending only, in
            the Groceries category).
          </InfoTip>
        </div>
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
    </>
  );

  if (layout === "panel") {
    return <div className="flex flex-col gap-4">{fields}</div>;
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
      <span className={labelClasses}>{initial ? "Edit metric" : "New calculated metric"}</span>
      {fields}
    </div>
  );
}
