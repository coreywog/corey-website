"use client";

import { useEffect, useState } from "react";
import { CalculatedMetricForm, type Aggregation, type DraftMetricFields, type MetricPeriod } from "./CalculatedMetricForm";
import type { CalculatedMetricOption } from "./types";
import type { ChartWidgetConfig } from "@/lib/dashboardConfig";
import { formatCategoryLabel } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const plainNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function formatPreviewValue(value: number, draft: DraftMetricFields): string {
  if (draft.aggregation === "count") return plainNumberFormatter.format(value);
  if (draft.period && draft.periodAggregation === "growth") return `${value >= 0 ? "+" : ""}${plainNumberFormatter.format(value)}%`;
  return currencyFormatter.format(value);
}

// What each aggregation actually measures, in plain language, as a noun
// phrase that slots into "This measures ___" or "this first measures ___
// for that {period}" below. Percentile is filled in separately (it needs
// the chosen percentile number).
const AGGREGATION_CLAUSE: Record<Aggregation, string> = {
  sum: "the total dollar amount",
  count: "how many transactions there are",
  average: "the average dollar amount",
  min: "the smallest transaction",
  max: "the largest transaction",
  range: "the gap between the smallest and largest transaction",
  median: "the middle (median) transaction amount",
  percentile: "", // computed inline below — depends on draft.percentile
  stddev: "how much transaction amounts typically vary (standard deviation)",
  variance: "the variance in transaction amounts",
};
const PERIOD_NOUN: Record<MetricPeriod, string> = { day: "day", week: "week", month: "month", year: "year" };
const PERIOD_ADJECTIVE: Record<MetricPeriod, string> = { day: "daily", week: "weekly", month: "monthly", year: "yearly" };

/** A dynamically-generated, plain-English sentence describing exactly what
 * the current fields compute — the direct answer to "what is this value
 * calculating?" rather than making someone infer it from a handful of
 * separately-labeled dropdowns. Rebuilt from `draft` alone (no network
 * round-trip needed), so it updates the instant a field changes, even
 * before the live preview number below it has caught up. */
function describeDraftMetric(draft: DraftMetricFields): string {
  const clause = draft.aggregation === "percentile" ? `the ${draft.percentile ?? 50}th-percentile transaction amount` : AGGREGATION_CLAUSE[draft.aggregation];
  const scopeParts: string[] = [];
  if (draft.transactionCategory) scopeParts.push(`${draft.transactionCategory} only`);
  if (draft.merchantCategories.length) scopeParts.push(`in ${draft.merchantCategories.map(formatCategoryLabel).join(", ")}`);
  const scope = scopeParts.length ? ` (${scopeParts.join(", ")})` : "";

  if (!draft.period) {
    return `This measures ${clause}${scope}.`;
  }

  const periodNoun = PERIOD_NOUN[draft.period];
  const periodAdj = PERIOD_ADJECTIVE[draft.period];
  const base = `For each ${periodNoun}, this first measures ${clause} for that ${periodNoun}${scope}.`;
  switch (draft.periodAggregation) {
    case "max":
      return `${base} Then it shows the highest of those ${periodAdj} figures.`;
    case "min":
      return `${base} Then it shows the lowest of those ${periodAdj} figures.`;
    case "average":
      return `${base} Then it averages those ${periodAdj} figures together.`;
    case "growth":
      return `${base} Then it compares the two most recent ${periodNoun}s and shows the percent change between them.`;
    default:
      return base;
  }
}

type PreviewState =
  | { status: "empty" } // no draft yet (shouldn't happen — CalculatedMetricForm reports one immediately — but a safe fallback)
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      value: number;
      sampleSize: number;
      label?: string;
      transactions?: { merchant: string; amount: number }[];
      transactionCount?: number;
    };

/**
 * Takes over the widget editor's live-preview area while a calculated
 * metric is being created or edited — see the plan behind this component:
 * previously "+ New calculated metric…" rendered a small CalculatedMetricForm
 * wedged into the crowded left drawer with zero feedback, which is exactly
 * how a non-periodic "Average, spending only" metric got silently combined
 * with an unrelated widget-level Group By into a confusing result. This
 * gives the metric its own focused space, plus a live "here's what this
 * actually computes right now" number fed by
 * app/api/dashboards/metrics/preview/route.ts (→
 * lib/dashboardQuery.ts's computeDraftMetricPreview), so the consequence of
 * each choice is visible before Save, not discovered after.
 *
 * `variant="panel"` is the desktop takeover (renders inside
 * WidgetEditorPanel's `lg:flex` right-hand panel, in place of the normal
 * Preview/Buttons/Axis-Detail/Color/Style content). `variant="inline"` is
 * the narrow-viewport fallback (that right panel doesn't exist below `lg`)
 * — same form, same help copy, same live preview, just laid out as a single
 * column inside the left drawer instead. Both share this one component so
 * the preview-fetch logic and copy never has to be maintained twice.
 */
export function MetricBuilderPanel({
  initial,
  categoryOptions,
  scope,
  variant,
  onSaved,
  onCancel,
}: {
  initial?: CalculatedMetricOption;
  categoryOptions: { category: string; subcategory: string }[];
  scope: { accountIds?: string[]; dateRange?: ChartWidgetConfig["dateRange"] };
  variant: "panel" | "inline";
  onSaved: (metric: CalculatedMetricOption) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<DraftMetricFields | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ status: "empty" });

  // Debounced (same 400ms pattern as the widget editor's own live preview,
  // WidgetEditorPanel.tsx) — fires on every field change reported up by
  // CalculatedMetricForm via onDraftChange, against the triggering widget's
  // own current account/date scope (the most relevant context, and free —
  // see computeDraftMetricPreview's own doc comment for why a metric-level
  // scope override isn't offered here).
  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setPreview({ status: "loading" });
      try {
        const res = await fetch("/api/dashboards/metrics/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric: { name: "Preview", ...draft }, scope }),
        });
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          setPreview({
            status: "ready",
            value: body.value,
            sampleSize: body.sampleSize,
            label: body.label,
            transactions: body.transactions,
            transactionCount: body.transactionCount,
          });
        } else {
          setPreview({ status: "error", message: "Couldn't compute a preview for this metric." });
        }
      } catch {
        if (!cancelled) setPreview({ status: "error", message: "Network error." });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `scope` is a fresh object each render; its actual fields (accountIds/dateRange) are what matter, and re-firing on an unrelated parent render just re-runs the same query, which is harmless (debounced, and the result would be identical).
  }, [draft]);

  const outerClass =
    variant === "panel"
      ? "flex flex-1 flex-col gap-4"
      : "flex flex-col gap-4 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]";

  return (
    <div className={outerClass}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <span aria-hidden>←</span> Back
        </button>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {initial ? `Edit “${initial.name}”` : "New calculated metric"}
        </span>
      </div>

      <div className="rounded-xl border border-black/[.08] bg-[var(--background)]/60 p-4 dark:border-white/[.1]">
        {/* Answers "what is this value calculating?" directly, in plain
            English, derived purely from the fields below (no server round
            trip needed) — the piece that was still missing even after the
            live-number preview: a number alone doesn't say what it means. */}
        {draft && <p className="text-sm text-zinc-700 dark:text-zinc-200">{describeDraftMetric(draft)}</p>}

        <div className={draft ? "mt-3 border-t border-black/[.06] pt-3 dark:border-white/[.08]" : undefined}>
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Right now, this computes to</span>
          {preview.status === "empty" && <p className="mt-1 text-sm text-zinc-500">Fill in the fields below to see a live example.</p>}
          {preview.status === "loading" && <p className="mt-1 text-2xl font-semibold text-zinc-400">…</p>}
          {preview.status === "error" && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{preview.message}</p>}
          {preview.status === "ready" && draft && (
            <>
              <p className="mt-1 text-2xl font-semibold">{formatPreviewValue(preview.value, draft)}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Based on {preview.sampleSize} matching transaction{preview.sampleSize === 1 ? "" : "s"}
                {scope.dateRange ? " in this widget's current date range" : ""}.
              </p>
              {preview.label && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{preview.label}</p>}
              {preview.transactions && preview.transactions.length > 0 && (
                <>
                  <p className="mt-2 text-[11px] text-zinc-500">The transactions that made up {preview.label}:</p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                    {preview.transactions.map((t, i) => (
                      <li key={i} className="flex justify-between gap-2">
                        <span className="truncate">{t.merchant}</span>
                        <span className="shrink-0 tabular-nums">{currencyFormatter.format(t.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {/* The non-row-level counterpart to the transaction list above
                  — see lib/dashboardQuery.ts's computePeriodicDetail for why
                  an average/median/percentile/etc. gets a count instead of a
                  curated "largest few" list (it would look contradictory
                  next to a smaller combined number). */}
              {preview.transactionCount !== undefined && (
                <p className="mt-2 text-[11px] text-zinc-500">
                  Made up of {preview.transactionCount} transaction{preview.transactionCount === 1 ? "" : "s"} that period.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <CalculatedMetricForm
        initial={initial}
        categoryOptions={categoryOptions}
        layout="panel"
        onSaved={onSaved}
        onCancel={onCancel}
        onDraftChange={setDraft}
      />
    </div>
  );
}
