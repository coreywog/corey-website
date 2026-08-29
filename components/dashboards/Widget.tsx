"use client";

import { useEffect, useRef, useState } from "react";
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
  Sector,
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
import type { WidgetConfig, ChartWidgetConfig, DateButtonConfig, DateButtonPreset, LineStyle, FillPattern, ValueFormat, FontFamily } from "@/lib/dashboardConfig";
import { METRIC_LABELS } from "@/lib/dashboardConfig";
import { describeDateRangeSelection } from "@/lib/finance";
import type { BarShapeProps, PieSectorShapeProps, PieLabelRenderProps } from "recharts";

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
const plainNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Y-axis ticks and tooltip values — currency by default (matches every
 * chart before this was configurable), plain thousands-separated otherwise
 * for measures that aren't dollar amounts (e.g. a transaction-count metric
 * shown as a bar chart). See axisLabels.valueFormat. */
function formatValue(v: number, format: ValueFormat | undefined): string {
  return format === "number" ? plainNumberFormatter.format(v) : currencyFormatter.format(v);
}

/** CSS font-family value for a chart's text (axis titles, ticks, legend) —
 * "sans"/"mono" reuse the site's own already-loaded Geist fonts rather than
 * pulling in anything new; "default"/unset means don't override at all
 * (inherit whatever the page already uses). */
function resolveFontFamily(family: FontFamily | undefined): string | undefined {
  switch (family) {
    case "sans":
      return "var(--font-sans)";
    case "serif":
      return "serif";
    case "mono":
      return "var(--font-mono)";
    default:
      return undefined;
  }
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
      No data in this range.
    </div>
  );
}

type AxisLabels = NonNullable<ChartWidgetConfig["axisLabels"]>;
// Passed down to every chart type that renders an axis title, so it can
// wire onMouseDown on that title (see axisLabelProp) back up to Widget's
// own drag tracking. Undefined everywhere except the editor's live
// preview — see Widget's onAxisLabelOffsetChange prop.
type AxisDragHandler = (axis: "x" | "y", e: React.MouseEvent<SVGTextElement>) => void;

// recharts' axis `label` prop: undefined renders no title at all, so this
// only builds one when the user actually set one. Always positioned below
// the X axis / left of the Y axis — there's no inside/outside choice
// anymore, since xOffset/yOffset (dragged directly in the editor's live
// preview — see onDragStart/Widget's startAxisDrag) covers fine
// positioning instead. `dx`/`dy` are plain SVG text attributes recharts'
// Label passes straight through, so the offset just nudges from that
// default position.
function axisLabelProp(
  axisLabels: AxisLabels | undefined,
  axis: "x" | "y",
  onDragStart?: (axis: "x" | "y", e: React.MouseEvent<SVGTextElement>) => void,
) {
  const text = axis === "x" ? axisLabels?.x : axisLabels?.y;
  if (!text) return undefined;
  const offset = axis === "x" ? axisLabels?.xOffset : axisLabels?.yOffset;
  return {
    value: text,
    position: axis === "x" ? ("bottom" as const) : ("left" as const),
    angle: axis === "y" ? -90 : undefined,
    dx: offset?.dx ?? 0,
    dy: offset?.dy ?? 0,
    style: {
      fontSize: axisLabels?.fontSize ?? 11,
      fontFamily: resolveFontFamily(axisLabels?.fontFamily),
      textAnchor: "middle" as const,
      cursor: onDragStart ? "grab" : undefined,
    },
    onMouseDown: onDragStart ? (e: React.MouseEvent<SVGTextElement>) => onDragStart(axis, e) : undefined,
  };
}

/** strokeDasharray values behind each named line style — kept out of the
 * zod schema (lib/dashboardConfig.ts only validates the name) so the saved
 * config can't carry an arbitrary dasharray string. Exported so the editor's
 * own line-style swatches render the exact same dash pattern as the chart
 * will, rather than a second hand-tuned approximation. */
export const LINE_STYLE_DASH: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 5",
  dotted: "2 4",
  dashDot: "9 4 2 4",
  longDash: "14 6",
};

/** Stable id for a (pattern, color) pair's <pattern> def — one per distinct
 * color actually in use, so a multi-category chart still reads by color
 * even once every bar shares the same texture. Exported so the editor's
 * preview swatches (WidgetEditorPanel) reference the same defs. */
export function fillPatternId(pattern: FillPattern, color: string): string {
  return `fill-${pattern}-${color.replace("#", "")}`;
}

/** What to actually pass as a shape's `fill` — the raw color for "solid",
 * or a reference into the <defs> block a FillPatternDefs renders alongside
 * it for anything else. */
export function resolveFill(pattern: FillPattern | undefined, color: string): string {
  if (!pattern || pattern === "solid") return color;
  return `url(#${fillPatternId(pattern, color)})`;
}

/** Renders one <pattern> per distinct (pattern, color) pair actually in use
 * — sits inside the chart's own <defs>, right next to the shapes that
 * reference it via resolveFill/fillPatternId. Takes a list rather than one
 * shared pattern + colors so per-point overrides (fillPatternOverrides) can
 * mix textures within a single chart, e.g. one bar dotted, the rest solid.
 * "solid" entries need no def and are skipped. Exported so the editor's
 * Style section can render true-to-life preview swatches off the exact
 * same pattern defs, not a hand-drawn approximation. */
export function FillPatternDefs({ items }: { items: { pattern: FillPattern; color: string }[] }) {
  const unique = new Map<string, { pattern: FillPattern; color: string }>();
  for (const item of items) {
    if (item.pattern === "solid") continue;
    unique.set(fillPatternId(item.pattern, item.color), item);
  }
  if (unique.size === 0) return null;
  return (
    <defs>
      {[...unique.values()].map(({ pattern, color: c }) => {
        const id = fillPatternId(pattern, c);
        switch (pattern) {
          case "dots":
            return (
              <pattern key={id} id={id} width={7} height={7} patternUnits="userSpaceOnUse">
                <rect width={7} height={7} fill={c} fillOpacity={0.18} />
                <circle cx={3.5} cy={3.5} r={1.4} fill={c} />
              </pattern>
            );
          case "diagonalLinesRight":
            return (
              <pattern key={id} id={id} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={7} height={7} fill={c} fillOpacity={0.18} />
                <line x1={0} y1={0} x2={0} y2={7} stroke={c} strokeWidth={3} />
              </pattern>
            );
          case "diagonalLinesLeft":
            return (
              <pattern key={id} id={id} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect width={7} height={7} fill={c} fillOpacity={0.18} />
                <line x1={0} y1={0} x2={0} y2={7} stroke={c} strokeWidth={3} />
              </pattern>
            );
          case "crossHatch":
            return (
              <pattern key={id} id={id} width={7} height={7} patternUnits="userSpaceOnUse">
                <rect width={7} height={7} fill={c} fillOpacity={0.18} />
                <path d="M0,0 L7,7 M7,0 L0,7" stroke={c} strokeWidth={1.4} />
              </pattern>
            );
          case "horizontalLines":
            return (
              <pattern key={id} id={id} width={7} height={7} patternUnits="userSpaceOnUse">
                <rect width={7} height={7} fill={c} fillOpacity={0.18} />
                <line x1={0} y1={3.5} x2={7} y2={3.5} stroke={c} strokeWidth={2} />
              </pattern>
            );
          case "verticalLines":
            return (
              <pattern key={id} id={id} width={7} height={7} patternUnits="userSpaceOnUse">
                <rect width={7} height={7} fill={c} fillOpacity={0.18} />
                <line x1={3.5} y1={0} x2={3.5} y2={7} stroke={c} strokeWidth={2} />
              </pattern>
            );
          case "solid":
            // Filtered out above — kept only so the switch is exhaustive
            // over FillPattern without an unchecked `default`.
            return null;
        }
      })}
    </defs>
  );
}

function LineWidget({
  points,
  axisLabels,
  color,
  lineStyle,
  onAxisDragStart,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  color?: string;
  lineStyle?: LineStyle;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color ?? "#6366f1"}
          strokeWidth={2}
          strokeDasharray={LINE_STYLE_DASH[lineStyle ?? "solid"]}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaWidget({
  points,
  axisLabels,
  color,
  lineStyle,
  fillPattern,
  onAxisDragStart,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  color?: string;
  lineStyle?: LineStyle;
  fillPattern?: FillPattern;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  const fill = color ?? "#6366f1";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <FillPatternDefs items={[{ pattern: fillPattern ?? "solid", color: fill }]} />
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={fill}
          strokeWidth={2}
          strokeDasharray={LINE_STYLE_DASH[lineStyle ?? "solid"]}
          fill={resolveFill(fillPattern, fill)}
          fillOpacity={fillPattern && fillPattern !== "solid" ? 1 : 0.2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarWidget({
  points,
  axisLabels,
  fillPattern,
  fillPatternOverrides,
  onPointClick,
  selectedKeys,
  onAxisDragStart,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  fillPattern?: FillPattern;
  fillPatternOverrides?: Record<string, FillPattern>;
  onPointClick?: (key: string) => void;
  selectedKeys?: Set<string>;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  const patternFor = (key: string) => fillPatternOverrides?.[key] ?? fillPattern;
  // Custom shape instead of <Cell> children: a <Cell> can only restyle the
  // bar's own outline, but "selected" needs to read as the whole bar lit
  // up, not just a border — easiest done by drawing a second, brighter
  // rectangle exactly on top of it.
  const renderBar = (props: BarShapeProps) => {
    const point = props.payload as AggregatedPoint;
    const isSelected = selectedKeys?.has(point.key) ?? false;
    return (
      <g onClick={onPointClick ? () => onPointClick(point.key) : undefined} style={onPointClick ? { cursor: "pointer" } : undefined}>
        <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={resolveFill(patternFor(point.key), point.color)} />
        {isSelected && (
          <rect
            x={props.x}
            y={props.y}
            width={props.width}
            height={props.height}
            fill="#6366f1"
            fillOpacity={0.45}
            stroke="#4338ca"
            strokeWidth={2}
          />
        )}
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 28 : 16 }}>
        <FillPatternDefs items={points.map((p) => ({ pattern: patternFor(p.key) ?? "solid", color: p.color }))} />
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={40}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Bar dataKey="value" isAnimationActive={false} shape={renderBar} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StackedBarWidget({
  points,
  series,
  fillPattern,
  axisLabels,
  stacked = true,
  onAxisDragStart,
}: {
  points: StackedPoint[];
  series: StackedSeries[];
  fillPattern?: FillPattern;
  axisLabels?: AxisLabels;
  // false renders the same per-series bars grouped side by side instead of
  // stacked — used for a multi-series bar/histogram widget (config.series),
  // as opposed to the "stackedBar" widget type's own auto-category split,
  // which is always stacked.
  stacked?: boolean;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 28 : 16 }}>
        <FillPatternDefs items={series.map((s) => ({ pattern: fillPattern ?? "solid", color: s.color }))} />
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="x"
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={40}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? "stack" : undefined}
            fill={resolveFill(fillPattern, s.color)}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function MultiLineWidget({
  points,
  series,
  axisLabels,
  onAxisDragStart,
}: {
  points: StackedPoint[];
  series: StackedSeries[];
  axisLabels?: AxisLabels;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MultiAreaWidget({
  points,
  series,
  axisLabels,
  onAxisDragStart,
}: {
  points: StackedPoint[];
  series: StackedSeries[];
  axisLabels?: AxisLabels;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={s.color}
            fillOpacity={0.18}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Where a pie slice's own number is drawn — inside the slice (white text,
 * centered partway out from the donut hole) or outside it (theme-colored
 * text at recharts' own default outside anchor, with a connecting line). */
function renderPieLabel(mode: "value" | "percent", position: "inside" | "outside") {
  return function PieSliceLabel(props: PieLabelRenderProps) {
    const { cx, cy, midAngle = 0, innerRadius, outerRadius, percent = 0, value, x, y } = props;
    const text = mode === "percent" ? `${Math.round(percent * 100)}%` : currencyFormatter.format(Number(value));
    if (position === "outside") {
      return (
        <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11} fill="currentColor">
          {text}
        </text>
      );
    }
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
    const ix = cx + radius * Math.cos(-midAngle * RADIAN);
    const iy = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={ix} y={iy} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="#fff">
        {text}
      </text>
    );
  };
}

function PieWidget({
  points,
  fillPattern,
  fillPatternOverrides,
  onPointClick,
  selectedKeys,
  pieLabels,
}: {
  points: AggregatedPoint[];
  fillPattern?: FillPattern;
  fillPatternOverrides?: Record<string, FillPattern>;
  onPointClick?: (key: string) => void;
  selectedKeys?: Set<string>;
  pieLabels?: ChartWidgetConfig["pieLabels"];
}) {
  if (points.length === 0) return <EmptyState />;
  const patternFor = (key: string) => fillPatternOverrides?.[key] ?? fillPattern;
  // Custom shape, same reasoning as BarWidget's renderBar: a selected slice
  // needs to read as lit up, not just outlined — drawn here as the normal
  // sector plus a second, slightly larger translucent sector on top, which
  // also pops the selection outward a few pixels.
  const renderSlice = (props: PieSectorShapeProps) => {
    const point = props.payload as AggregatedPoint;
    const isSelected = selectedKeys?.has(point.key) ?? false;
    return (
      <g onClick={onPointClick ? () => onPointClick(point.key) : undefined} style={onPointClick ? { cursor: "pointer" } : undefined}>
        <Sector
          cx={props.cx}
          cy={props.cy}
          innerRadius={props.innerRadius}
          outerRadius={props.outerRadius}
          startAngle={props.startAngle}
          endAngle={props.endAngle}
          fill={resolveFill(patternFor(point.key), point.color)}
        />
        {isSelected && (
          <Sector
            cx={props.cx}
            cy={props.cy}
            innerRadius={props.innerRadius}
            outerRadius={props.outerRadius + 6}
            startAngle={props.startAngle}
            endAngle={props.endAngle}
            fill="#6366f1"
            fillOpacity={0.45}
            stroke="#4338ca"
            strokeWidth={2}
          />
        )}
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <FillPatternDefs items={points.map((p) => ({ pattern: patternFor(p.key) ?? "solid", color: p.color }))} />
        <Tooltip formatter={(v) => currencyFormatter.format(Number(v))} />
        <Pie
          data={points}
          dataKey="value"
          nameKey="label"
          innerRadius="45%"
          outerRadius="80%"
          isAnimationActive={false}
          shape={renderSlice}
          label={pieLabels?.show ? renderPieLabel(pieLabels.show, pieLabels.position ?? "outside") : undefined}
          labelLine={Boolean(pieLabels?.show) && (pieLabels?.position ?? "outside") === "outside"}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ScatterWidget({
  points,
  axisLabels,
  onAxisDragStart,
}: {
  points: ScatterPoint[];
  axisLabels?: AxisLabels;
  onAxisDragStart?: AxisDragHandler;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 8, left: 8, bottom: axisLabels?.x ? 20 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: axisLabels?.xTickFontSize ?? 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          tickFormatter={shortDate}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          dataKey="y"
          tick={{ fontSize: axisLabels?.yTickFontSize ?? 12, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip
          formatter={(v, name) => (name === "y" ? formatValue(Number(v), axisLabels?.valueFormat) : shortDate(Number(v)))}
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

function TableWidget({
  points,
  onPointClick,
  selectedKeys,
}: {
  points: AggregatedPoint[];
  onPointClick?: (key: string) => void;
  selectedKeys?: Set<string>;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <div className="h-full overflow-y-auto text-sm">
      <table className="w-full">
        <tbody>
          {points.map((p) => (
            <tr
              key={p.key}
              onClick={onPointClick ? () => onPointClick(p.key) : undefined}
              className={
                "border-b border-black/[.05] dark:border-white/[.06] " +
                (onPointClick ? "cursor-pointer " : "") +
                (selectedKeys?.has(p.key) ? "bg-black/[.05] dark:bg-white/[.08]" : "")
              }
            >
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
export function Widget({
  widget,
  onPointClick,
  selectedKeys,
  onAxisLabelOffsetChange,
}: {
  widget: WidgetWithData;
  // Editor-only: lets a viewer click a bar/slice/row directly in the chart
  // to select it for bulk color/pattern editing, instead of a separate list
  // of chip buttons. Undefined on the real dashboard (Widget is rendered
  // read-only there), so this is a no-op there — no cursor change, no click
  // handler attached.
  onPointClick?: (key: string) => void;
  selectedKeys?: Set<string>;
  // Editor-only, same reasoning as onPointClick: lets the axis title be
  // dragged directly in the live preview (see axisLabelProp's onMouseDown)
  // instead of picking from a fixed list of positions. Called once, on
  // mouseup, with the final offset — WidgetEditorPanel owns the actual
  // config.axisLabels.xOffset/yOffset state.
  onAxisLabelOffsetChange?: (axis: "x" | "y", offset: { dx: number; dy: number }) => void;
}) {
  const chartConfig = widget.config?.dataSource === "transactions" ? widget.config : undefined;
  // Recomputed on every render (never stored) so a blank-titled widget using
  // a fluid date range — "Last month", a monthsWindow, YTD — keeps reading
  // correctly as time passes: "Spending — July" becomes "Spending — August"
  // on its own once August ends, with nothing to manually retype.
  const autoTitle = chartConfig
    ? `${chartConfig.series?.length ? "Multiple series" : chartConfig.customMetricId ? "Custom metric" : METRIC_LABELS[chartConfig.metric]} — ${describeDateRangeSelection(chartConfig.dateRange)}`
    : null;
  const title = widget.title ?? autoTitle ?? "Widget";
  const dateButtons = chartConfig?.dateButtons ?? [];

  const [activeButton, setActiveButton] = useState<DateButtonConfig | null>(null);
  const [overrideResult, setOverrideResult] = useState<WidgetResult | { error: string } | null>(null);

  // Axis-title drag tracking. dragRef (not state) holds the in-progress
  // drag itself since mousemove fires far more often than React should
  // re-render for; liveAxisOffset is the part that actually needs to be
  // state, so the title visually follows the cursor while dragging.
  const dragRef = useRef<{ axis: "x" | "y"; startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);
  const [liveAxisOffset, setLiveAxisOffset] = useState<Partial<Record<"x" | "y", { dx: number; dy: number }>>>({});

  useEffect(() => {
    // Captured into a local const so the nested onUp closure below keeps
    // TS's non-undefined narrowing from the guard on the next line — a
    // closure over the prop itself doesn't retain that narrowing.
    const commitOffset = onAxisLabelOffsetChange;
    if (!commitOffset) return;
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const next = { dx: d.baseDx + (e.clientX - d.startX), dy: d.baseDy + (e.clientY - d.startY) };
      setLiveAxisOffset((prev) => ({ ...prev, [d.axis]: next }));
    }
    function onUp() {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setLiveAxisOffset((prev) => {
        const off = prev[d.axis];
        // commitOffset's non-undefined check above (`if (!commitOffset)
        // return;`) doesn't carry through this closure per TS's rules for
        // captured consts across nested function boundaries — safe to
        // assert, since commitOffset is never reassigned after that guard.
        if (off) commitOffset!(d.axis, off);
        return prev;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onAxisLabelOffsetChange]);

  function startAxisDrag(axis: "x" | "y", e: React.MouseEvent<SVGTextElement>) {
    e.preventDefault();
    const base = axis === "x" ? chartConfig?.axisLabels?.xOffset : chartConfig?.axisLabels?.yOffset;
    dragRef.current = { axis, startX: e.clientX, startY: e.clientY, baseDx: base?.dx ?? 0, baseDy: base?.dy ?? 0 };
  }

  // The live drag position layered on top of the saved config — so the
  // title actually moves during a drag, not just after it commits on
  // mouseup. Identical to chartConfig.axisLabels everywhere else (both
  // fields fall back to their saved value when nothing's being dragged).
  const effectiveAxisLabels: AxisLabels | undefined = chartConfig?.axisLabels
    ? {
        ...chartConfig.axisLabels,
        xOffset: liveAxisOffset.x ?? chartConfig.axisLabels.xOffset,
        yOffset: liveAxisOffset.y ?? chartConfig.axisLabels.yOffset,
      }
    : undefined;
  const axisDragHandler = onAxisLabelOffsetChange ? startAxisDrag : undefined;

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
          <ScatterWidget points={result.points} axisLabels={effectiveAxisLabels} onAxisDragStart={axisDragHandler} />
        ) : result.kind === "stacked" ? (
          <StackedBarWidget
            points={result.points}
            series={result.series}
            fillPattern={chartConfig?.fillPattern}
            axisLabels={effectiveAxisLabels}
            onAxisDragStart={axisDragHandler}
          />
        ) : result.kind === "multiSeries" ? (
          widget.type === "line" ? (
            <MultiLineWidget points={result.points} series={result.series} axisLabels={effectiveAxisLabels} onAxisDragStart={axisDragHandler} />
          ) : widget.type === "area" ? (
            <MultiAreaWidget points={result.points} series={result.series} axisLabels={effectiveAxisLabels} onAxisDragStart={axisDragHandler} />
          ) : (
            // bar, histogram, and stackedBar all share the same wide-row
            // shape — grouped (side-by-side) unless the widget type is
            // specifically "stackedBar", which stacks them instead.
            <StackedBarWidget
              points={result.points}
              series={result.series}
              fillPattern={chartConfig?.fillPattern}
              axisLabels={effectiveAxisLabels}
              onAxisDragStart={axisDragHandler}
              stacked={widget.type === "stackedBar"}
            />
          )
        ) : result.kind === "stat" ? (
          <StatWidget result={result} color={chartConfig?.color} />
        ) : widget.type === "bar" || widget.type === "histogram" ? (
          <BarWidget
            points={result.points}
            axisLabels={effectiveAxisLabels}
            fillPattern={chartConfig?.fillPattern}
            fillPatternOverrides={chartConfig?.fillPatternOverrides}
            onPointClick={onPointClick}
            selectedKeys={selectedKeys}
            onAxisDragStart={axisDragHandler}
          />
        ) : widget.type === "pie" ? (
          <PieWidget
            points={result.points}
            fillPattern={chartConfig?.fillPattern}
            fillPatternOverrides={chartConfig?.fillPatternOverrides}
            onPointClick={onPointClick}
            selectedKeys={selectedKeys}
            pieLabels={chartConfig?.pieLabels}
          />
        ) : widget.type === "table" ? (
          <TableWidget points={result.points} onPointClick={onPointClick} selectedKeys={selectedKeys} />
        ) : widget.type === "calendar" ? (
          <CalendarWidget points={result.points} color={chartConfig?.color} />
        ) : widget.type === "area" ? (
          <AreaWidget
            points={result.points}
            axisLabels={effectiveAxisLabels}
            color={chartConfig?.color}
            lineStyle={chartConfig?.lineStyle}
            fillPattern={chartConfig?.fillPattern}
            onAxisDragStart={axisDragHandler}
          />
        ) : (
          <LineWidget
            points={result.points}
            axisLabels={effectiveAxisLabels}
            color={chartConfig?.color}
            lineStyle={chartConfig?.lineStyle}
            onAxisDragStart={axisDragHandler}
          />
        )}
      </div>
    </div>
  );
}
