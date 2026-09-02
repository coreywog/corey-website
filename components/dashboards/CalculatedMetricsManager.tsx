"use client";

import { useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { CalculatedMetricForm } from "./CalculatedMetricForm";
import type { CalculatedMetricOption } from "./types";

const AGGREGATION_LABELS: Record<string, string> = {
  sum: "Sum",
  average: "Average",
  count: "Count",
  min: "Minimum",
  max: "Maximum",
  range: "Range",
  median: "Median",
  percentile: "Percentile",
  stddev: "Standard deviation",
  variance: "Variance",
};
const PERIOD_LABELS: Record<string, string> = { day: "day", week: "week", month: "month", year: "year" };
const PERIOD_AGGREGATION_LABELS: Record<string, string> = {
  max: "highest",
  min: "lowest",
  average: "average per",
  growth: "growth across",
};

/** One-line human description of a saved metric's actual definition — the
 * same pieces CalculatedMetricForm lets you set, read back out, so the
 * management list doesn't need you to open Edit just to remember what a
 * metric does. */
function describeMetric(m: CalculatedMetricOption): string {
  const agg = AGGREGATION_LABELS[m.aggregation] ?? m.aggregation;
  const base = m.aggregation === "percentile" && m.percentile ? `${m.percentile}th percentile` : agg;
  const periodic = m.period ? ` — ${PERIOD_AGGREGATION_LABELS[m.periodAggregation ?? "max"]} ${PERIOD_LABELS[m.period]}` : "";
  const scope = [
    m.transactionCategory ? `${m.transactionCategory} only` : null,
    m.merchantCategories.length ? m.merchantCategories.map(formatCategoryLabel).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${base}${periodic}${scope ? ` (${scope})` : ""}`;
}

/**
 * "Calculated Metrics" section on the Settings page — a real management
 * surface for the saved metrics the widget editor's "+ New calculated
 * metric…" flow creates. Previously there was no way to see them all in
 * one place, edit one, or actually reach the (already-existing but
 * uncalled) delete endpoint.
 */
export function CalculatedMetricsManager({
  initialMetrics,
  categoryOptions,
}: {
  initialMetrics: CalculatedMetricOption[];
  categoryOptions: { category: string; subcategory: string }[];
}) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(metric: CalculatedMetricOption) {
    if (!window.confirm(`Delete "${metric.name}"? Any widget still using it falls back to its own built-in metric.`)) return;
    setDeletingId(metric.id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/metrics/${metric.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to delete (${res.status}).`);
        return;
      }
      setMetrics((prev) => prev.filter((m) => m.id !== metric.id));
    } catch {
      setError("Network error — try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {metrics.length === 0 && !adding && (
        <p className="text-sm text-zinc-500">None yet — a widget&apos;s Metric picker can create one, or start here.</p>
      )}

      {metrics.map((m) =>
        editingId === m.id ? (
          <CalculatedMetricForm
            key={m.id}
            initial={m}
            categoryOptions={categoryOptions}
            onSaved={(updated) => {
              setMetrics((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-md border border-black/[.08] px-3 py-2 dark:border-white/[.1]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="truncate text-xs text-zinc-500">{describeMetric(m)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingId(m.id)}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-black/[.06] hover:text-zinc-900 dark:hover:bg-white/[.08] dark:hover:text-zinc-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(m)}
                disabled={deletingId === m.id}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                {deletingId === m.id ? "…" : "Delete"}
              </button>
            </div>
          </div>
        ),
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {adding ? (
        <CalculatedMetricForm
          categoryOptions={categoryOptions}
          onSaved={(metric) => {
            setMetrics((prev) => [...prev, metric]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-start rounded-md border border-black/[.1] px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
        >
          + Add metric
        </button>
      )}
    </div>
  );
}
