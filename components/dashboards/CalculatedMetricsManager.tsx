"use client";

import { useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { CalculatedMetricForm } from "./CalculatedMetricForm";
import type { CalculatedMetricOption } from "./types";
import type { MetricUsageEntry } from "@/lib/dashboardQuery";

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
 * uncalled) delete endpoint. Now also shows, for every metric, exactly
 * which dashboard widgets currently use it — and re-checks that before
 * letting a delete through, since deleting a metric a widget still
 * references makes that widget silently fall back to a generic built-in
 * measure instead of erroring, which is easy to not notice happened.
 */
export function CalculatedMetricsManager({
  initialMetrics,
  categoryOptions,
  initialUsage,
}: {
  initialMetrics: CalculatedMetricOption[];
  categoryOptions: { category: string; subcategory: string }[];
  initialUsage: Record<string, MetricUsageEntry[]>;
}) {
  const [metrics, setMetrics] = useState(initialMetrics);
  const [usage, setUsage] = useState(initialUsage);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Distinct from "which row is mid-delete" (deletingId, below) — this is
  // "which row is showing the confirm-before-delete step," entered by
  // clicking Delete and left by Cancel or a completed delete.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startDelete(id: string) {
    setError(null);
    setConfirmingDeleteId(id);
    // Re-checked here, not just read from the page-load snapshot — a
    // widget could have started using this metric (or stopped) since this
    // page loaded, and the whole point of this step is not to be stale
    // right before a destructive action.
    setCheckingUsage(true);
    try {
      const res = await fetch("/api/dashboards/metrics/usage");
      if (res.ok) {
        const body = await res.json();
        setUsage(body.usage);
      }
    } catch {
      // Falls back to the last-known snapshot (page load, or an earlier
      // check) — still shows a real, if possibly slightly stale, warning
      // rather than blocking the whole delete flow on a network hiccup.
    } finally {
      setCheckingUsage(false);
    }
  }

  async function confirmDelete(metric: CalculatedMetricOption) {
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
      setConfirmingDeleteId(null);
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

      {metrics.map((m) => {
        const usedBy = usage[m.id] ?? [];
        if (editingId === m.id) {
          return (
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
          );
        }
        if (confirmingDeleteId === m.id) {
          return (
            <div
              key={m.id}
              className={
                "flex flex-col gap-2 rounded-md border p-3 " +
                (usedBy.length > 0
                  ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
                  : "border-black/[.08] dark:border-white/[.1]")
              }
            >
              {checkingUsage ? (
                <p className="text-sm text-zinc-500">Checking where &ldquo;{m.name}&rdquo; is used…</p>
              ) : usedBy.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    This will affect {usedBy.length} widget{usedBy.length === 1 ? "" : "s"}
                  </p>
                  <ul className="flex flex-col gap-0.5 text-xs text-red-700/90 dark:text-red-300/90">
                    {usedBy.map((u) => (
                      <li key={u.widgetId}>
                        {u.dashboardName} → {u.tabName} → &ldquo;{u.widgetTitle}&rdquo;
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-700/90 dark:text-red-300/90">
                    Deleting &ldquo;{m.name}&rdquo; won&rsquo;t delete these widgets, but any graph or number built from it will fall back to a
                    generic built-in metric.
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Delete &ldquo;{m.name}&rdquo;? Nothing currently uses it.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(null)}
                  className="rounded-md border border-black/[.1] px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(m)}
                  disabled={checkingUsage || deletingId === m.id}
                  className={
                    "rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 " +
                    (usedBy.length > 0 ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900")
                  }
                >
                  {deletingId === m.id ? "Deleting…" : usedBy.length > 0 ? "Delete anyway" : "Delete"}
                </button>
              </div>
            </div>
          );
        }
        return (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-md border border-black/[.08] px-3 py-2 dark:border-white/[.1]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="truncate text-xs text-zinc-500">{describeMetric(m)}</p>
              <p className={"truncate text-[11px] " + (usedBy.length > 0 ? "text-amber-700 dark:text-amber-400" : "text-zinc-400")}>
                {usedBy.length > 0 ? `Used on ${usedBy.length} widget${usedBy.length === 1 ? "" : "s"}` : "Not used on any dashboard"}
              </p>
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
                onClick={() => startDelete(m.id)}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}

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
