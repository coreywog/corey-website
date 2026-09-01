"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
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
  LabelList,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { AggregatedPoint, ScatterPoint, StackedPoint, StackedSeries, WidgetResult } from "@/lib/dashboardQuery";
import type { WidgetConfig, ChartWidgetConfig, DateButtonConfig, DateButtonPreset, LineStyle, FillPattern, ValueFormat, FontFamily } from "@/lib/dashboardConfig";
import { METRIC_LABELS } from "@/lib/dashboardConfig";
import { describeDateRangeSelection } from "@/lib/finance";
import type { BarShapeProps, PieSectorShapeProps, PieLabelRenderProps } from "recharts";

// Dropped into a custom widget title (WidgetEditorPanel's Title field) to
// have that one spot re-resolve live to the widget's own date range text —
// see the `customTitle` computation below. Exported so the editor can offer
// an "insert" button for it rather than requiring it to be typed exactly.
export const TITLE_DATE_TOKEN = "{date}";

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

/** recharts' XAxis/YAxis `tick` prop — the tick-size/font object normally,
 * or `false` to hide the tick labels entirely (showXTicks/showYTicks:
 * false) for a cleaner tile with no category names or axis clutter. */
function tickProp(axisLabels: AxisLabels | undefined, axis: "x" | "y"): false | { fontSize: number; fontFamily?: string } {
  const visible = axis === "x" ? (axisLabels?.showXTicks ?? true) : (axisLabels?.showYTicks ?? true);
  if (!visible) return false;
  return {
    fontSize: axis === "x" ? (axisLabels?.xTickFontSize ?? 11) : (axisLabels?.yTickFontSize ?? 12),
    fontFamily: resolveFontFamily(axisLabels?.fontFamily),
  };
}

/** The Y axis's own reserved width — hiding its tick labels (showYTicks:
 * false) previously left this at its full fixed size regardless, since
 * `tick={false}` only skips drawing the label text, not the space reserved
 * for it. With axisLine/tickLine already always off (see every <YAxis>
 * below), a hidden Y axis draws literally nothing — so the full 56px was
 * pure dead space on one side of the plot, visibly skewing everything else
 * (the bars, the grid) off toward the other side instead of centering it in
 * the tile. 4px keeps a hair of breathing room rather than jamming the plot
 * flush against the tile's own edge. */
function yAxisWidth(axisLabels: AxisLabels | undefined): number {
  return (axisLabels?.showYTicks ?? true) ? 56 : 4;
}

/** Same idea as yAxisWidth, for the X axis's own reserved height — only
 * needed by the two chart types (bar/stackedBar) whose category labels
 * rotate -20° and so need real vertical room even to just fit; every other
 * chart type leaves X axis height to recharts' own (much smaller) default,
 * which already shrinks reasonably on its own once tick text is hidden. */
function xAxisHeightRotated(axisLabels: AxisLabels | undefined): number {
  return (axisLabels?.showXTicks ?? true) ? 40 : 4;
}

/** Y axis tick count and value range — omitted (the historical default, and
 * still the default for every existing widget) lets recharts pick its own
 * "nice round numbers"; setting yDomainMin/yDomainMax overrides just that
 * one end of the range, and yTickCount asks for roughly that many gridlines
 * instead of recharts' usual ~5 (still rounded to values it finds "nice",
 * not necessarily exact). */
function yAxisProps(axisLabels: AxisLabels | undefined): { domain?: [number | string, number | string]; tickCount?: number } {
  const { yDomainMin, yDomainMax, yTickCount } = axisLabels ?? {};
  const hasDomain = yDomainMin !== undefined || yDomainMax !== undefined;
  return {
    ...(hasDomain ? { domain: [yDomainMin ?? "auto", yDomainMax ?? "auto"] as [number | string, number | string] } : {}),
    ...(yTickCount !== undefined ? { tickCount: yTickCount } : {}),
  };
}

/** Extra chart margin (beyond the tick labels' own space, which recharts
 * already reserves on its own) an axis title needs to render without being
 * clipped — it sits *outside* the plot area now (position "bottom"/"left",
 * see axisLabelProp), so bumping "Title size" bigger needs the container to
 * actually make room, not just change what gets drawn into the same fixed
 * few pixels. One line of text at that font size, plus Label's own default
 * 5px offset from the axis, plus a little breathing room. Returns 0 when
 * that axis has no title at all. */
// Every chart's margins + its X axis's own reserved height (rotated tick
// labels need real vertical room — see the `height={40}` on each XAxis
// below) add up to somewhere around 55-65px of fixed vertical overhead
// before a single pixel of actual plot area is drawn, regardless of how
// small the tile gets. Below this floor, ResponsiveContainer hands recharts
// a box where that overhead alone exceeds the total height, and the
// computed plot area collapses to zero (visible in the DOM as the chart's
// clipPath rect getting height="0") — everything inside it (bars, grid
// lines, the Y axis) just vanishes, leaving nothing but a stray X axis
// label floating in an otherwise blank tile. Below the floor, recharts still
// renders at this fixed size instead of the container's true (smaller) one
// — the tile's own overflow-hidden (see Widget's root className) crops the
// excess, which reads as "a legible but cropped chart" instead of "no chart
// at all." Width has the same issue on a narrow axis (the Y axis's own
// fixed width plus tick labels).
const CHART_MIN_WIDTH = 120;
const CHART_MIN_HEIGHT = 110;

function axisTitleMargin(axisLabels: AxisLabels | undefined, axis: "x" | "y"): number {
  const hasTitle = Boolean(axis === "x" ? axisLabels?.x : axisLabels?.y);
  if (!hasTitle) return 0;
  return (axisLabels?.fontSize ?? 11) + 14;
}

/** Small value label rendered on/above each bar or line/area point — off
 * unless config.showDataLabels is set. Reuses formatValue so it respects
 * the same $/plain-number choice as the axis ticks/tooltip. */
function dataLabelList(show: boolean | undefined, valueFormat: ValueFormat | undefined, dataKey = "value") {
  if (!show) return null;
  return (
    <LabelList
      dataKey={dataKey}
      position="top"
      fontSize={10}
      fill="currentColor"
      formatter={(v: unknown) => formatValue(Number(v), valueFormat)}
    />
  );
}

/** The chart's background grid — reference lines aligned to both axes' tick
 * values, not just the horizontal (Y-axis) ones every chart hardcoded
 * before. Omitted/true shows it (the new default); false hides it
 * entirely. A fixed mid-gray rather than the default "currentColor"-ish
 * "#ccc": recharts' own default reads fine against a plain white tile, but
 * washes out to essentially invisible against this app's light themes
 * (creamsicle's cream background especially) — #888 at 0.3 opacity holds up
 * across light, dark, and creamsicle alike. */
function chartGridLines(show: boolean | undefined) {
  if (show === false) return null;
  return <CartesianGrid stroke="#888888" strokeDasharray="3 3" opacity={0.3} />;
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
  showDataLabels,
  showGridLines,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  color?: string;
  lineStyle?: LineStyle;
  onAxisDragStart?: AxisDragHandler;
  showDataLabels?: boolean;
  showGridLines?: boolean;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: axisTitleMargin(axisLabels, "x") }}>
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="label"
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
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
        >
          {dataLabelList(showDataLabels, axisLabels?.valueFormat)}
        </Line>
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
  showDataLabels,
  showGridLines,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  color?: string;
  lineStyle?: LineStyle;
  fillPattern?: FillPattern;
  onAxisDragStart?: AxisDragHandler;
  showDataLabels?: boolean;
  showGridLines?: boolean;
}) {
  if (points.length === 0) return <EmptyState />;
  const fill = color ?? "#6366f1";
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: axisTitleMargin(axisLabels, "x") }}>
        <FillPatternDefs items={[{ pattern: fillPattern ?? "solid", color: fill }]} />
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="label"
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
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
        >
          {dataLabelList(showDataLabels, axisLabels?.valueFormat)}
        </Area>
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
  showDataLabels,
  showGridLines,
}: {
  points: AggregatedPoint[];
  axisLabels?: AxisLabels;
  fillPattern?: FillPattern;
  fillPatternOverrides?: Record<string, FillPattern>;
  onPointClick?: (key: string) => void;
  selectedKeys?: Set<string>;
  onAxisDragStart?: AxisDragHandler;
  showDataLabels?: boolean;
  showGridLines?: boolean;
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
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: 16 + axisTitleMargin(axisLabels, "x") }}>
        <FillPatternDefs items={points.map((p) => ({ pattern: patternFor(p.key) ?? "solid", color: p.color }))} />
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="label"
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={xAxisHeightRotated(axisLabels)}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Bar dataKey="value" isAnimationActive={false} shape={renderBar}>
          {dataLabelList(showDataLabels, axisLabels?.valueFormat)}
        </Bar>
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
  showDataLabels,
  showGridLines,
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
  showGridLines?: boolean;
  showDataLabels?: boolean;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: 16 + axisTitleMargin(axisLabels, "x") }}>
        <FillPatternDefs items={series.map((s) => ({ pattern: fillPattern ?? "solid", color: s.color }))} />
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="x"
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={xAxisHeightRotated(axisLabels)}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
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
          >
            {dataLabelList(showDataLabels, axisLabels?.valueFormat, s.key)}
          </Bar>
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
  showDataLabels,
  showGridLines,
}: {
  points: StackedPoint[];
  series: StackedSeries[];
  axisLabels?: AxisLabels;
  onAxisDragStart?: AxisDragHandler;
  showDataLabels?: boolean;
  showGridLines?: boolean;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: axisTitleMargin(axisLabels, "x") }}>
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="label"
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
          tickFormatter={(v: number) => formatValue(v, axisLabels?.valueFormat)}
          label={axisLabelProp(axisLabels, "y", onAxisDragStart)}
        />
        <Tooltip formatter={(v) => formatValue(Number(v), axisLabels?.valueFormat)} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: resolveFontFamily(axisLabels?.fontFamily) }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false}>
            {dataLabelList(showDataLabels, axisLabels?.valueFormat, s.key)}
          </Line>
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
  showDataLabels,
  showGridLines,
}: {
  points: StackedPoint[];
  series: StackedSeries[];
  axisLabels?: AxisLabels;
  onAxisDragStart?: AxisDragHandler;
  showDataLabels?: boolean;
  showGridLines?: boolean;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: axisTitleMargin(axisLabels, "x") }}>
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="label"
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
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
          >
            {dataLabelList(showDataLabels, axisLabels?.valueFormat, s.key)}
          </Area>
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
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
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
  showGridLines,
}: {
  points: ScatterPoint[];
  axisLabels?: AxisLabels;
  onAxisDragStart?: AxisDragHandler;
  showGridLines?: boolean;
}) {
  if (points.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={CHART_MIN_WIDTH} minHeight={CHART_MIN_HEIGHT}>
      <ScatterChart margin={{ top: 8, right: 8, left: 8 + axisTitleMargin(axisLabels, "y"), bottom: axisTitleMargin(axisLabels, "x") }}>
        {chartGridLines(showGridLines)}
        <XAxis
          dataKey="x"
          type="number"
          domain={["dataMin", "dataMax"]}
          tick={tickProp(axisLabels, "x")}
          tickLine={false}
          axisLine={false}
          tickFormatter={shortDate}
          label={axisLabelProp(axisLabels, "x", onAxisDragStart)}
        />
        <YAxis
          dataKey="y"
          tick={tickProp(axisLabels, "y")}
          {...yAxisProps(axisLabels)}
          tickLine={false}
          axisLine={false}
          width={yAxisWidth(axisLabels)}
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

const CALENDAR_WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const calendarMonthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Real month-grid calendar — one block per calendar month the "day"-grouped
 * series covers, each with a Sun..Sat weekday header and day-of-month
 * numbers, weeks running top-to-bottom and days left-to-right within a week
 * (standard wall-calendar reading order). Replaces an earlier GitHub-
 * contributions-style layout that ran weeks as columns with no date numbers
 * at all — unreadable as an actual calendar. Cells are shaded by value
 * magnitude relative to the max day in range, same idea as before, but the
 * shading is now a separate layer behind the day number instead of fading
 * the whole cell, so the date stays legible regardless of intensity.
 * Multiple months lay out left-to-right and wrap like a wall calendar. */
function CalendarWidget({ points, color }: { points: AggregatedPoint[]; color?: string }) {
  if (points.length === 0) return <EmptyState />;
  const byDate = new Map(points.map((p) => [p.key, p.value]));
  const dates = points.map((p) => new Date(`${p.key}T00:00:00.000Z`));
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const end = new Date(Math.max(...dates.map((d) => d.getTime())));
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  const accent = color ?? "#6366f1";

  // Every calendar month the range touches, oldest first.
  const months: { year: number; month: number }[] = [];
  const monthCursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (monthCursor <= lastMonth) {
    months.push({ year: monthCursor.getUTCFullYear(), month: monthCursor.getUTCMonth() });
    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
  }

  return (
    <div className="flex h-full flex-wrap gap-4 overflow-auto">
      {months.map(({ year, month }) => {
        const firstOfMonth = new Date(Date.UTC(year, month, 1));
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        // Leading blanks so day 1 lands under its actual weekday column.
        type Cell = { day: number; iso: string; value: number; inRange: boolean } | null;
        const cells: Cell[] = Array.from({ length: firstOfMonth.getUTCDay() }, () => null);
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(Date.UTC(year, month, d));
          const iso = date.toISOString().slice(0, 10);
          cells.push({ day: d, iso, value: byDate.get(iso) ?? 0, inRange: date >= start && date <= end });
        }
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={`${year}-${month}`} className="shrink-0">
            <div className="mb-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{calendarMonthFormatter.format(firstOfMonth)}</div>
            <div className="grid grid-cols-7 gap-[3px]">
              {CALENDAR_WEEKDAY_LABELS.map((label, i) => (
                <div key={i} className="flex h-4 w-6 items-center justify-center text-[9px] text-zinc-400 dark:text-zinc-500">
                  {label}
                </div>
              ))}
              {cells.map((c, i) => {
                if (!c) return <div key={i} className="h-6 w-6" />;
                const opacity = c.inRange ? 0.15 + 0.85 * (Math.abs(c.value) / maxAbs) : 0;
                return (
                  <div
                    key={c.iso}
                    title={c.inRange ? `${c.iso}: ${currencyFormatter.format(c.value)}` : c.iso}
                    className="relative flex h-6 w-6 items-center justify-center rounded-sm"
                  >
                    {c.inRange && <div className="absolute inset-0 rounded-sm" style={{ backgroundColor: accent, opacity }} />}
                    <span
                      className={
                        "relative text-[9px] font-medium tabular-nums " +
                        (c.inRange ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-300 dark:text-zinc-700")
                      }
                    >
                      {c.day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
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
  onChange: (btn: DateButtonConfig | null) => void;
}) {
  const btnClasses = (isActive: boolean) =>
    "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors " +
    (isActive
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
      : "text-zinc-500 hover:bg-black/[.06] dark:text-zinc-400 dark:hover:bg-white/[.1] creamsicle:text-orange-700 creamsicle:hover:bg-orange-100");
  return (
    // Same pill-group-next-to-heading treatment as the original hand-built
    // Finance pages used (since removed) for their own date-range picker.
    <div className="flex min-w-0 shrink flex-wrap items-center gap-1 overflow-hidden rounded-full border border-black/[.08] p-0.5 dark:border-white/[.1] creamsicle:border-orange-200">
      {buttons.map((b) => {
        const key = dateButtonKey(b);
        const isActive = activeKey === key;
        return (
          <button
            key={key}
            type="button"
            // Clicking the already-active button turns it back off — reverts
            // to the widget's own configured date range — rather than only
            // ever being able to switch to a *different* button.
            onClick={() => onChange(isActive ? null : b)}
            className={btnClasses(isActive)}
            title={isActive ? "Click to go back to the widget's own date range" : b.kind === "custom" ? `${b.start} – ${b.end}` : undefined}
          >
            {dateButtonLabel(b)}
          </button>
        );
      })}
    </div>
  );
}

function CalendarButtonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.5v3M11 1.5v3" />
    </svg>
  );
}

/**
 * Calendar icon + popover next to the quick-range buttons (DateRangeButtons
 * above) for picking a precise start/end range the presets don't cover.
 * Fetches the widget's actual data bounds on open (see
 * /api/dashboards/widgets/date-bounds) and passes them straight through as
 * native <input type="date"> min/max — the browser's own date picker
 * already renders a real calendar and grays out anything outside that
 * range, so there's no need to reimplement one. Applying reuses the exact
 * same per-viewer override path a preset button uses (onChange with a
 * "custom" DateButtonConfig) — see DateRangeButtons and Widget's
 * activeButton state.
 */
function DateRangeCalendarPicker({
  chartConfig,
  activeKey,
  onChange,
}: {
  chartConfig: ChartWidgetConfig;
  activeKey: string | null;
  onChange: (btn: DateButtonConfig | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // undefined = still loading, null = no data at all matches this widget's filters.
  const [bounds, setBounds] = useState<{ min: string; max: string } | null | undefined>(undefined);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const isActive = activeKey?.startsWith("custom:Custom:") ?? false;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/dashboards/widgets/date-bounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: chartConfig }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setBounds(body.bounds ?? null);
      })
      .catch(() => {
        if (!cancelled) setBounds(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chartConfig is a fresh object every render (derived from widget.config); only `open` should re-trigger this.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function apply() {
    if (!start || !end) return;
    onChange({ kind: "custom", label: "Custom", start, end });
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          // Reset to the loading state on every open (not inside the fetch
          // effect below, which only runs the fetch itself) — a stale
          // bounds/no-data message from a previous open would otherwise
          // flash before the fresh fetch resolves.
          const next = !open;
          if (next) setBounds(undefined);
          setOpen(next);
        }}
        title={isActive ? "Click to go back to the widget's own date range" : "Pick a precise date range"}
        className={
          "flex items-center justify-center rounded-full p-1 transition-colors " +
          (isActive
            ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
            : "text-zinc-500 hover:bg-black/[.06] dark:text-zinc-400 dark:hover:bg-white/[.1] creamsicle:text-orange-700 creamsicle:hover:bg-orange-100")
        }
      >
        <CalendarButtonIcon />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-black/[.08] bg-[var(--background)] p-3 text-xs shadow-lg dark:border-white/[.15] creamsicle:border-orange-200"
        >
          {bounds === undefined ? (
            <p className="text-zinc-500">Checking available dates…</p>
          ) : bounds === null ? (
            <p className="text-zinc-500">No data available to pick a range from.</p>
          ) : (
            <>
              <p className="mb-2 text-[10px] text-zinc-500">
                Data available {bounds.min} – {bounds.max}
              </p>
              <label className="mb-1.5 flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-zinc-500">Start</span>
                <input
                  type="date"
                  value={start}
                  min={bounds.min}
                  max={end || bounds.max}
                  onChange={(e) => setStart(e.target.value)}
                  className="rounded-md border border-black/[.1] bg-white px-1.5 py-1 text-xs outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300"
                />
              </label>
              <label className="mb-2 flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-zinc-500">End</span>
                <input
                  type="date"
                  value={end}
                  min={start || bounds.min}
                  max={bounds.max}
                  onChange={(e) => setEnd(e.target.value)}
                  className="rounded-md border border-black/[.1] bg-white px-1.5 py-1 text-xs outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStart("");
                    setEnd("");
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-[11px] text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  Clear
                </button>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={!start || !end}
                    className="rounded-md bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A toggle-pill row for a multi-series widget (config.showSeriesToggles) —
 * one pill per line/area/bar, colored to match, that hides/shows just that
 * series client-side. Same per-viewer-only, never-touches-saved-config
 * spirit as DateRangeButtons above, but there's nothing to re-fetch: the
 * underlying data is already loaded, so this just filters what's passed to
 * the chart (see hiddenSeriesKeys in Widget).
 */
function SeriesToggleButtons({
  series,
  hiddenKeys,
  onToggle,
}: {
  series: StackedSeries[];
  hiddenKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex min-w-0 shrink flex-wrap items-center gap-1 overflow-hidden rounded-full border border-black/[.08] p-0.5 dark:border-white/[.1] creamsicle:border-orange-200">
      {series.map((s) => {
        const isHidden = hiddenKeys.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onToggle(s.key)}
            title={isHidden ? `Show ${s.label}` : `Hide ${s.label}`}
            className={
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors " +
              (isHidden
                ? "text-zinc-400 opacity-50 hover:opacity-80 dark:text-zinc-500"
                : "text-zinc-600 hover:bg-black/[.06] dark:text-zinc-300 dark:hover:bg-white/[.1]")
            }
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: isHidden ? "transparent" : s.color, border: `1px solid ${s.color}` }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Catches a render-time exception thrown by the actual chart body (recharts
 * occasionally throws outright — e.g. its "nice tick" math can misbehave at
 * certain tickCount/domain combinations — rather than degrading visually)
 * so one misconfigured tile shows its own inline error instead of taking
 * down the whole dashboard. Must be a class component; React only supports
 * error boundaries that way. Keyed by the caller on whatever config could
 * plausibly cause a fresh crash (see ChartErrorBoundary's usage below), so
 * fixing that setting actually retries the render instead of staying stuck
 * on a stale error.
 */
class ChartErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Widget chart failed to render", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center text-center text-sm text-red-600 dark:text-red-400">
          Couldn&rsquo;t render this chart with its current settings.
        </div>
      );
    }
    return this.props.children;
  }
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
  // A custom title still gets the same live date text substituted in
  // wherever TITLE_DATE_TOKEN appears — "Food Budget — {date}" reads as
  // "Food Budget — July" today and "Food Budget — August" once August
  // starts, same fluid-tracking behavior as the fully auto-generated title
  // above, just with the user's own wording kept around the moving part
  // instead of losing it entirely by having to choose between a frozen
  // custom title or the generic metric-based auto one.
  const customTitle =
    widget.title && chartConfig
      ? widget.title.replaceAll(TITLE_DATE_TOKEN, describeDateRangeSelection(chartConfig.dateRange))
      : widget.title;
  const title = customTitle ?? autoTitle ?? "Widget";
  const dateButtons = chartConfig?.dateButtons ?? [];

  const [activeButton, setActiveButton] = useState<DateButtonConfig | null>(null);
  const [overrideResult, setOverrideResult] = useState<WidgetResult | { error: string } | null>(null);

  // Click-to-drill-down from a category bar into its subcategories — only
  // for a bar widget grouped by merchantCategory, and only on the real
  // dashboard (onPointClick being set means Widget is rendering inside the
  // editor's own live preview instead, where a bar click already means
  // "select this for bulk color/pattern editing" — see onPointClick's own
  // doc comment). One level deep only: clicking a subcategory bar while
  // already drilled in does nothing, there's nowhere further to go.
  const canDrilldown = !onPointClick && widget.type === "bar" && chartConfig?.groupBy === "merchantCategory";
  const [drilldown, setDrilldown] = useState<{ key: string; label: string } | null>(null);
  const [drilldownResult, setDrilldownResult] = useState<WidgetResult | { error: string } | null>(null);

  // Which series (by key) a viewer has clicked off — client-side only, like
  // activeButton above: never touches the saved config, resets on reload.
  // Keyed by StackedSeries.key rather than index so it survives a re-fetch
  // reordering series (it never does today, but nothing guarantees it won't).
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<Set<string>>(new Set());
  function toggleSeriesKey(key: string) {
    setHiddenSeriesKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  useEffect(() => {
    if (!drilldown || !chartConfig) return;
    let cancelled = false;
    // Whatever date range is currently in effect (a dateButtons override if
    // one's active, otherwise the widget's own saved range) carries through
    // to the drilldown — subcategories for "this month's Food spending"
    // should stay scoped to this month, not silently reset to all time.
    const dateRange = activeButton ? dateButtonRange(activeButton) : chartConfig.dateRange;
    const drillConfig: ChartWidgetConfig = {
      ...chartConfig,
      groupBy: "merchantSubcategory",
      dateRange,
      filters: { ...chartConfig.filters, merchantCategories: [drilldown.key] },
    };
    fetch("/api/dashboards/widgets/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: widget.type, config: drillConfig }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setDrilldownResult(body.result ?? { error: "Failed to load subcategories." });
      })
      .catch(() => {
        if (!cancelled) setDrilldownResult({ error: "Network error." });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chartConfig is a fresh object every render; only drilldown/activeButton/the widget identity should re-trigger this.
  }, [drilldown, activeButton, widget.type, widget.id]);

  const result =
    drilldown && drilldownResult
      ? drilldownResult
      : activeButton !== null && overrideResult
        ? overrideResult
        : widget.result;

  const handleBarClick = canDrilldown
    ? (key: string) => {
        if (drilldown) return; // already one level deep — nowhere further to go
        const point = !("error" in result) && result.kind === "series" ? result.points.find((p) => p.key === key) : undefined;
        setDrilldown({ key, label: point?.label ?? key });
      }
    : undefined;
  // Series toggles read off the *live* series list (result.series), not the
  // saved config's series entries — same key, but this is what's actually
  // on the chart right now, colors and all, including under a dateButtons
  // override above.
  const toggleableSeries =
    chartConfig?.showSeriesToggles && !("error" in result) && result.kind === "multiSeries" ? result.series : [];
  // What actually reaches the chart — same list, minus whatever's been
  // clicked off above. Recomputed from result.series (not stored) so a
  // dateButtons-driven re-fetch keeps respecting whatever's currently hidden.
  const visibleMultiSeries =
    !("error" in result) && result.kind === "multiSeries" ? result.series.filter((s) => !hiddenSeriesKeys.has(s.key)) : [];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-black/[.08] bg-[var(--background)] dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/40">
      <div className="flex min-w-0 items-center gap-2 border-b border-black/[.08] px-3 py-2 dark:border-white/[.1] creamsicle:border-orange-200">
        {/* Only the title itself is the drag handle, not the whole header
            row — so clicking a date button never risks starting a drag
            (see DashboardGrid's dragConfig, which matches this exact
            class). Buttons sit immediately right of the title, divided by
            a rule, both hugging the left edge — same range-picker-next-to-
            heading pattern the original hand-built Finance pages used
            (since removed), not spread to the tile's far corners. */}
        <span className="widget-drag-handle shrink truncate cursor-move text-sm font-medium text-zinc-500 select-none dark:text-zinc-500 creamsicle:text-orange-700">
          {title}
        </span>
        {drilldown && (
          <>
            <span aria-hidden className="h-4 w-px shrink-0 bg-black/[.12] dark:bg-white/[.15] creamsicle:bg-orange-300" />
            <button
              type="button"
              onClick={() => setDrilldown(null)}
              title="Back to categories"
              className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-black/[.06] dark:text-zinc-400 dark:hover:bg-white/[.1] creamsicle:text-orange-700 creamsicle:hover:bg-orange-100"
            >
              ← {drilldown.label}
            </button>
          </>
        )}
        {dateButtons.length > 0 && (
          <>
            <span aria-hidden className="h-4 w-px shrink-0 bg-black/[.12] dark:bg-white/[.15] creamsicle:bg-orange-300" />
            <DateRangeButtons
              buttons={dateButtons}
              activeKey={activeButton ? dateButtonKey(activeButton) : null}
              onChange={setActiveButton}
            />
            {chartConfig && (
              <DateRangeCalendarPicker
                chartConfig={chartConfig}
                activeKey={activeButton ? dateButtonKey(activeButton) : null}
                onChange={setActiveButton}
              />
            )}
          </>
        )}
        {toggleableSeries.length > 1 && (
          <>
            <span aria-hidden className="h-4 w-px shrink-0 bg-black/[.12] dark:bg-white/[.15] creamsicle:bg-orange-300" />
            <SeriesToggleButtons series={toggleableSeries} hiddenKeys={hiddenSeriesKeys} onToggle={toggleSeriesKey} />
          </>
        )}
      </div>
      <div className="min-h-0 flex-1 p-3">
        {/* Keyed on everything that could plausibly change what recharts
            renders — a fresh key remounts the boundary, giving a changed
            setting a real retry instead of staying stuck on a stale crash
            from a previous config. */}
        <ChartErrorBoundary key={`${widget.id}:${activeButton ? dateButtonKey(activeButton) : ""}:${drilldown?.key ?? ""}:${JSON.stringify(chartConfig)}`}>
        {"error" in result ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-red-600 dark:text-red-400">
            {result.error}
          </div>
        ) : result.kind === "text" ? (
          <TextWidget text={result.text} />
        ) : result.kind === "scatter" ? (
          <ScatterWidget
            points={result.points}
            axisLabels={effectiveAxisLabels}
            onAxisDragStart={axisDragHandler}
            showGridLines={chartConfig?.showGridLines}
          />
        ) : result.kind === "stacked" ? (
          <StackedBarWidget
            points={result.points}
            series={result.series}
            fillPattern={chartConfig?.fillPattern}
            axisLabels={effectiveAxisLabels}
            onAxisDragStart={axisDragHandler}
            showDataLabels={chartConfig?.showDataLabels}
            showGridLines={chartConfig?.showGridLines}
          />
        ) : result.kind === "multiSeries" ? (
          widget.type === "line" ? (
            <MultiLineWidget
              points={result.points}
              series={visibleMultiSeries}
              axisLabels={effectiveAxisLabels}
              onAxisDragStart={axisDragHandler}
              showDataLabels={chartConfig?.showDataLabels}
              showGridLines={chartConfig?.showGridLines}
            />
          ) : widget.type === "area" ? (
            <MultiAreaWidget
              points={result.points}
              series={visibleMultiSeries}
              axisLabels={effectiveAxisLabels}
              onAxisDragStart={axisDragHandler}
              showDataLabels={chartConfig?.showDataLabels}
              showGridLines={chartConfig?.showGridLines}
            />
          ) : (
            // bar, histogram, and stackedBar all share the same wide-row
            // shape — grouped (side-by-side) unless the widget type is
            // specifically "stackedBar", which stacks them instead.
            <StackedBarWidget
              points={result.points}
              series={visibleMultiSeries}
              fillPattern={chartConfig?.fillPattern}
              axisLabels={effectiveAxisLabels}
              onAxisDragStart={axisDragHandler}
              stacked={widget.type === "stackedBar"}
              showDataLabels={chartConfig?.showDataLabels}
              showGridLines={chartConfig?.showGridLines}
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
            onPointClick={onPointClick ?? handleBarClick}
            selectedKeys={selectedKeys}
            onAxisDragStart={axisDragHandler}
            showDataLabels={chartConfig?.showDataLabels}
            showGridLines={chartConfig?.showGridLines}
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
            showDataLabels={chartConfig?.showDataLabels}
            showGridLines={chartConfig?.showGridLines}
          />
        ) : (
          <LineWidget
            points={result.points}
            axisLabels={effectiveAxisLabels}
            color={chartConfig?.color}
            lineStyle={chartConfig?.lineStyle}
            onAxisDragStart={axisDragHandler}
            showDataLabels={chartConfig?.showDataLabels}
            showGridLines={chartConfig?.showGridLines}
          />
        )}
        </ChartErrorBoundary>
      </div>
    </div>
  );
}
