"use client";

import { InfoTip } from "./InfoTip";
import { selectClasses, labelClasses, pillClasses } from "./WidgetEditorPanel";
import type { CalculatedMetricOption } from "./types";
import type { Metric } from "@/lib/dashboardConfig";

/**
 * A widget's Metric picker — built-in measures and saved custom metrics as
 * two separate, always-visible selects (never merged into one dropdown the
 * way this used to work), plus a standalone "+ Create new metric" button
 * instead of a synthetic option buried inside a select. Corey's own framing:
 * "we should separate the calculated metrics somehow away from the generic
 * finances related metrics! which we should keep." Only one of the two
 * selects is ever "live" at a time — a widget's `metric`/`customMetricId`
 * are mutually exclusive at the config level (see lib/dashboardConfig.ts),
 * so switching to a built-in metric happens by picking one there (the
 * Built-in select's own placeholder is disabled while a custom metric is
 * active, so there's no dead "— none —" state to get stuck in — pick a real
 * built-in value to switch back).
 *
 * Used identically by both the single-metric picker and each multi-series
 * row's picker in WidgetEditorPanel.tsx — those two call sites used to be
 * near-duplicate inline <select> blocks; this is the de-duplicated version.
 */
export function MetricPicker({
  value,
  builtinOptions,
  calculatedMetrics,
  allowCustom,
  onSelectBuiltin,
  onSelectCustom,
  onCreate,
  onEdit,
}: {
  value: { kind: "builtin"; metric: Metric } | { kind: "custom"; id: string };
  builtinOptions: { value: Metric; label: string }[];
  calculatedMetrics: CalculatedMetricOption[];
  // false for scatter/histogram/stackedBar (single picker) — those chart
  // types plot/bin raw transactions or stack a fixed set of series, none of
  // which has a "sum vs. average" distinction a saved metric could apply
  // to. Hides the whole "Your metrics" select + Create button, same guard
  // this replaced.
  allowCustom: boolean;
  onSelectBuiltin: (metric: Metric) => void;
  onSelectCustom: (id: string) => void;
  onCreate: () => void;
  onEdit: (metric: CalculatedMetricOption) => void;
}) {
  const activeCustom = value.kind === "custom" ? calculatedMetrics.find((m) => m.id === value.id) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className={labelClasses}>Metric</span>
        <InfoTip label="the metric picker">
          Built-in metrics cover the basics. For anything more specific — averages, percentiles, a single category, a
          particular time window — build a custom metric once and reuse it on any widget.
        </InfoTip>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-zinc-500">Built-in</span>
        <select
          value={value.kind === "builtin" ? value.metric : ""}
          onChange={(e) => onSelectBuiltin(e.target.value as Metric)}
          className={selectClasses}
        >
          {value.kind !== "builtin" && (
            <option value="" disabled>
              — none —
            </option>
          )}
          {builtinOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-zinc-500">Four fixed measures, always available: spending, income, net, and count.</span>
      </label>

      {allowCustom && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">Your metrics</span>
            <div className="flex items-center gap-1.5">
              <select
                value={value.kind === "custom" ? value.id : ""}
                onChange={(e) => {
                  if (e.target.value) onSelectCustom(e.target.value);
                }}
                disabled={calculatedMetrics.length === 0}
                className={selectClasses + " flex-1"}
              >
                <option value="">{calculatedMetrics.length === 0 ? "No custom metrics yet" : "— none —"}</option>
                {calculatedMetrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {activeCustom && (
                <button
                  type="button"
                  onClick={() => onEdit(activeCustom)}
                  title="Edit this metric"
                  aria-label="Edit this metric"
                  className="shrink-0 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  ✎
                </button>
              )}
            </div>
            <span className="text-[11px] text-zinc-500">Saved metrics you&rsquo;ve built — reusable across any widget.</span>
          </label>

          <button type="button" onClick={onCreate} className={pillClasses(false) + " self-start"}>
            + Create new metric
          </button>
        </>
      )}
    </div>
  );
}
