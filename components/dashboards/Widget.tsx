"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Area,
  AreaChart,
  Bar,
  BarChart,
  Pie,
  PieChart,
  Scatter,
  ScatterChart,
  Cell,
  Tooltip,
  Legend,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { AggregatedPoint, ScatterPoint, StackedPoint, StackedSeries, WidgetResult } from "@/lib/dashboardQuery";
import type { WidgetConfig, ChartWidgetConfig, DateButtonConfig, DateButtonPreset } from "@/lib/dashboardConfig";

export type WidgetWithData = {
  id: string;
  type: string;
  title: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  result: WidgetResult | { error: string };
  // The validated config, so the editor can be opened pre-filled with the
  // current settings — null when the stored config failed validation (see
  // lib/dashboardConfig.ts); editing is disabled for those (see
  // DashboardGrid.tsx), though the widget can still be deleted.
  config: WidgetConfig | null;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
      No data in this range.
    </div>
  );
}

type AxisLabels = NonNullable<ChartWidgetConfig["axisLabels"]>;

// recharts' axis `label` prop: undefined renders no title at all, so this
// only builds one when the user actually set one. Position and font size
// are both user-adjustable (see the editor's Axis titles section) — insideBottom/
// insideLeft and 11px are just the defaults when they haven't touched them.
function axisLabelProp(axisLabels: AxisLabels | undefined, axis: "x" | "y") {
  const text = axis === "x" ? axisLabels?.x : axisLabels?.y;
  if (!text) return undefined;
  const position = axis === "x" ? (axisLabels?.xPosition ?? "insideBottom") : (axisLabels?.yPosition ?? "insideLeft");
  return {
    value: text,
    position,
    angle: axis === "y" ? -90 : undefined,
    style: { fontSize: axisLabels?.fontSize ?? 11, textAnchor: "middle" as const },
  };
}

function LineWidget({
  points,
  axisLabels,
  color,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  color?: string;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x")}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
          label={axisLabelProp(axisLabels, "y")}
        />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Line type="monotone" dataKey="value" stroke={color ?? "#6366f1"} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaWidget({
  points,
  axisLabels,
  color,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  color?: string;
}) {
  if (points.length === 0) return <EmptyState />;
  const fill = color ?? "#6366f1";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x")}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
          label={axisLabelProp(axisLabels, "y")}
        />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Area type="monotone" dataKey="value" stroke={fill} strokeWidth={2} fill={fill} fillOpacity={0.2} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarWidget({ points, axisLabels }: { points: AggregatedPoint[]; axisLabels?: AxisLabels }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 28 : 16 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={40}
          label={axisLabelProp(axisLabels, "x")}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
          label={axisLabelProp(axisLabels, "y")}
        />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Bar dataKey="value" isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.key} fill={p.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function StackedBarWidget({ points, series }: { points: StackedPoint[]; series: StackedSeries[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={40} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
        />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="stack" fill={s.color} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieWidget({ points }: { points: AggregatedPoint[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Pie data={points} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="80%" isAnimationActive={false}>
          {points.map((p) => (
            <Cell key={p.key} fill={p.color} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ScatterWidget({ points, axisLabels }: { points: ScatterPoint[]; axisLabels?: AxisLabels }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={shortDate}
          label={axisLabelProp(axisLabels, "x")}
        />
        <YAxis
          dataKey="y"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => currencyFormatter.format(v)}
          label={axisLabelProp(axisLabels, "y")}
        />
        <Tooltip
          formatter={(v, name) => (name === "y" ? currencyFormatter.format(Number(v)) : shortDate(Number(v)))}
          labelFormatter={() => ""}
        />
        <Scatter data={points} isAnimationActive={false}>
          {points.map((p, i) => (
            <Cell key={i} fill={p.color} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function StatWidget({ result, color }: { result: Extract<WidgetResult, { kind: "stat" }>; color?: string }) {
  const delta = result.previousValue !== undefined ? result.value - result.previousValue : null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <div className="text-2xl font-semibold tabular-nums" style={color ? { color } : undefined}>
        {currencyFormatter.format(result.value)}
      </div>
      {delta !== null && (
        <div
          className={
            delta >= 0
              ? "text-sm text-emerald-600 dark:text-emerald-400"
              : "text-sm text-rose-600 dark:text-rose-400"
          }
        >
          {delta >= 0 ? "+" : ""}
          {currencyFormatter.format(delta)} vs. prior period
        </div>
      )}
    </div>
  );
}

function TextWidget({ text }: { text: string }) {
  return (
    <div className="h-full overflow-y-auto whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{text}</div>
  );
}

function TableWidget({ points }: { points: AggregatedPoint[] }) {
  if (points.length === 0) return <EmptyState />;
  return (
    <div className="h-full overflow-y-auto text-sm">
      <table className="w-full">
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="border-b border-black/[.05] dark:border-white/[.06]">
              <td className="py-1 pr-2">
                <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: p.color }} />
                {p.label}
              </td>
              <td className="py-1 text-right tabular-nums">{currencyFormatter.format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// GitHub-style day grid — one cell per day the "day"-grouped series covers,
// shaded by value magnitude relative to the max day in range. Weeks run
// top-to-bottom in columns (Sun..Sat rows), oldest week on the left, same
// convention as a contributions graph.
function CalendarWidget({ points, color }: { points: AggregatedPoint[]; color?: string }) {
  if (points.length === 0) return <EmptyState />;
  const byDate = new Map(points.map((p) => [p.key, p.value]));
  const dates = points.map((p) => new Date(`${p.key}T00:00:00.000Z`));
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const end = new Date(Math.max(...dates.map((d) => d.getTime())));
  // Back up to the preceding Sunday so the grid's first column is a full week.
  const gridStart = new Date(start);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const accent = color ?? "#6366f1";
  const weeks: { date: Date; iso: string; value: number }[][] = [];
  const cursor = new Date(gridStart);
  let week: { date: Date; iso: string; value: number }[] = [];
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    week.push({ date: new Date(cursor), iso, value: byDate.get(iso) ?? 0 });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (week.length > 0) weeks.push(week);

  return (
    <div className="flex h-full items-center overflow-x-auto">
      <div className="flex gap-[3px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {w.map((d) => {
              const inRange = d.date >= start && d.date <= end;
              const opacity = inRange ? 0.12 + 0.88 * (Math.abs(d.value) / maxAbs) : 0;
              return (
                <div
                  key={d.iso}
                  title={inRange ? `${d.iso}: ${currencyFormatter.format(d.value)}` : undefined}
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: inRange ? accent : "transparent", opacity: inRange ? opacity : 0 }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A quick-range button's display text — also used by WidgetEditorPanel to
 * render the same chips while editing the list. */
export function dateButtonLabel(btn: DateButtonConfig): string {
  if (btn.kind === "custom") return btn.label;
  if (btn.kind === "relativeDays") {
    if (btn.days === 0) return "Today";
    if (btn.days === 1) return "Yesterday";
    return `${btn.days}d ago`;
  }
  switch (btn.preset) {
    case "1m":
      return "1M";
    case "3m":
      return "3M";
    case "6m":
      return "6M";
    case "1y":
      return "1Y";
    case "ytd":
      return "YTD";
    case "all":
      return "All";
  }
}

/** Stable identity for a button, independent of object reference — the
 * config array is a fresh object every render, so "is this the active one"
 * has to compare by value, not `===`. Also used by WidgetEditorPanel as a
 * React list key and to prevent adding the same preset twice. */
export function dateButtonKey(btn: DateButtonConfig): string {
  if (btn.kind === "custom") return `custom:${btn.label}:${btn.start}:${btn.end}`;
  if (btn.kind === "relativeDays") return `relativeDays:${btn.days}`;
  return `preset:${btn.preset}`;
}

/** Resolves a button to the concrete dateRange it should apply — computed
 * at click time (not stored), so "YTD"/relative presets always mean "as of
 * right now" rather than whenever the button was configured. */
function dateButtonRange(btn: DateButtonConfig): ChartWidgetConfig["dateRange"] {
  if (btn.kind === "custom") return { mode: "custom", start: btn.start, end: btn.end };
  if (btn.kind === "relativeDays") return { mode: "relativeDays", days: btn.days };
  switch (btn.preset) {
    case "1m":
      return { mode: "relative", months: 1 };
    case "3m":
      return { mode: "relative", months: 3 };
    case "6m":
      return { mode: "relative", months: 6 };
    case "1y":
      return { mode: "relative", months: 12 };
    case "all":
      return { mode: "allTime" };
    case "ytd":
      return { mode: "ytd" };
  }
}

/** Approximate day-span a preset implies — e.g. "6M" ≈ 186 days, "All" =
 * unbounded. Used only by WidgetEditorPanel, to decide which quick-range
 * buttons are worth offering for a widget's own configured date scope: a
 * widget already narrowed to "2 days ago" has no sensible "6 months"
 * button to add, since there's nothing wider to view within it. */
export function dateButtonPresetDays(preset: DateButtonPreset): number {
  switch (preset) {
    case "1m":
      return 31;
    case "3m":
      return 93;
    case "6m":
      return 186;
    case "1y":
      return 366;
    case "ytd": {
      const now = new Date();
      const jan1 = Date.UTC(now.getUTCFullYear(), 0, 1);
      return Math.floor((now.getTime() - jan1) / 86400000);
    }
    case "all":
      return Infinity;
  }
}

/**
 * The small quick-range row a widget can opt into (config.dateButtons —
 * see lib/dashboardConfig.ts) so a viewer can change its range without
 * opening the editor. Re-fetches through the same preview endpoint the
 * editor's own live preview uses, entirely client-side — never touches the
 * saved config, so it's purely a per-viewer, per-session override. Its own
 * range is independent of the widget's saved dateRange — a widget filtered
 * to 6 months of data can still offer a custom "July" button outside that
 * window, since the override always re-queries from scratch.
 */
function DateRangeButtons({
  buttons,
  activeKey,
  onChange,
}: {
  buttons: DateButtonConfig[];
  activeKey: string | null;
  onChange: (btn: DateButtonConfig) => void;
}) {
  const btnClasses = (isActive: boolean) =>
    "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors " +
    (isActive
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
      : "text-zinc-500 hover:bg-black/[.06] dark:text-zinc-400 dark:hover:bg-white/[.1] creamsicle:text-orange-700 creamsicle:hover:bg-orange-100");
  return (
    // Same pill-group-next-to-heading treatment as the original Finance
    // tab's RangeSelector (components/finance/RangeSelector.tsx).
    <div className="flex min-w-0 shrink flex-wrap items-center gap-1 overflow-hidden rounded-full border border-black/[.08] p-0.5 dark:border-white/[.1] creamsicle:border-orange-200">
      {buttons.map((b) => {
        const key = dateButtonKey(b);
        return (
          <button key={key} type="button" onClick={() => onChange(b)} className={btnClasses(activeKey === key)} title={b.kind === "custom" ? `${b.start} – ${b.end}` : undefined}>
            {dateButtonLabel(b)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One dashboard tile. The drag handle is scoped to just the title bar
 * (`.widget-drag-handle`, matched by DashboardGrid's dragConfig) so
 * interactive content underneath (a future table's scroll, tooltips) isn't
 * fighting drag gestures.
 */
export function Widget({ widget }: { widget: WidgetWithData }) {
  const title = widget.title ?? "Widget";
  const chartConfig = widget.config?.dataSource === "transactions" ? widget.config : undefined;
  const dateButtons = chartConfig?.dateButtons ?? [];

  const [activeButton, setActiveButton] = useState<DateButtonConfig | null>(null);
  const [overrideResult, setOverrideResult] = useState<WidgetResult | { error: string } | null>(null);

  useEffect(() => {
    if (!activeButton || !chartConfig) return;
    let cancelled = false;
    const dateRange = dateButtonRange(activeButton);
    fetch("/api/dashboards/widgets/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: widget.type, config: { ...chartConfig, dateRange } }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setOverrideResult(body.result ?? { error: "Failed to load this range." });
      })
      .catch(() => {
        if (!cancelled) setOverrideResult({ error: "Network error." });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chartConfig is a fresh object every render (derived from widget.config); only activeButton and the widget identity should re-trigger this.
  }, [activeButton, widget.type, widget.id]);

  const result = activeButton !== null && overrideResult ? overrideResult : widget.result;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-black/[.08] bg-[var(--background)] dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/40">
      <div className="flex min-w-0 items-center gap-2 border-b border-black/[.08] px-3 py-2 dark:border-white/[.1] creamsicle:border-orange-200">
        {/* Only the title itself is the drag handle, not the whole header
            row — so clicking a date button never risks starting a drag
            (see DashboardGrid's dragConfig, which matches this exact
            class). Buttons sit immediately right of the title, divided by
            a rule, both hugging the left edge — same as the original
            Finance tab's RangeSelector-next-to-heading pattern
            (DailyCashFlowChart), not spread to the tile's far corners. */}
        <span className="widget-drag-handle shrink truncate cursor-move text-sm font-medium text-zinc-500 select-none dark:text-zinc-500 creamsicle:text-orange-700">
          {title}
        </span>
        {dateButtons.length > 0 && (
          <>
            <span aria-hidden className="h-4 w-px shrink-0 bg-black/[.12] dark:bg-white/[.15] creamsicle:bg-orange-300" />
            <DateRangeButtons
              buttons={dateButtons}
              activeKey={activeButton ? dateButtonKey(activeButton) : null}
              onChange={setActiveButton}
            />
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 p-3">
        {"error" in result ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-red-600 dark:text-red-400">
            {result.error}
          </div>
        ) : result.kind === "text" ? (
          <TextWidget text={result.text} />
        ) : result.kind === "scatter" ? (
          <ScatterWidget points={result.points} axisLabels={chartConfig?.axisLabels} />
        ) : result.kind === "stacked" ? (
          <StackedBarWidget points={result.points} series={result.series} />
        ) : result.kind === "stat" ? (
          <StatWidget result={result} color={chartConfig?.color} />
        ) : widget.type === "bar" || widget.type === "histogram" ? (
          <BarWidget points={result.points} axisLabels={chartConfig?.axisLabels} />
        ) : widget.type === "pie" ? (
          <PieWidget points={result.points} />
        ) : widget.type === "table" ? (
          <TableWidget points={result.points} />
        ) : widget.type === "calendar" ? (
          <CalendarWidget points={result.points} color={chartConfig?.color} />
        ) : widget.type === "area" ? (
          <AreaWidget points={result.points} axisLabels={chartConfig?.axisLabels} color={chartConfig?.color} />
        ) : (
          <LineWidget points={result.points} axisLabels={chartConfig?.axisLabels} color={chartConfig?.color} />
        )}
      </div>
    </div>
  );
}
