"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCategoryLabel, describeDateRangeSelection } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
import { colorForKey } from "@/components/finance/categoryColors";
import {
  GraphIcon,
  TextIcon,
  LineChartIcon,
  AreaChartIcon,
  BarChartIcon,
  StackedBarIcon,
  PieChartIcon,
  StatIcon,
  TableIcon,
  ScatterIcon,
  HistogramIcon,
  CalendarIcon,
} from "./icons";
import {
  Widget,
  dateButtonLabel,
  dateButtonKey,
  dateButtonPresetDays,
  LINE_STYLE_DASH,
  FillPatternDefs,
  resolveFill,
  TITLE_DATE_TOKEN,
  type WidgetWithData,
} from "./Widget";
import type { CalculatedMetricOption } from "./types";
import { MetricBuilderPanel } from "./MetricBuilderPanel";
import type {
  WidgetConfig,
  ChartWidgetConfig,
  WidgetType,
  Metric,
  GroupBy,
  DateButtonConfig,
  DateButtonPreset,
  LineStyle,
  FillPattern,
  FontFamily,
  CumulativeBasis,
  TableColumn,
} from "@/lib/dashboardConfig";
import {
  WIDGET_COLORS,
  DATE_BUTTON_PRESETS,
  GRADIENT_PRESETS,
  LINE_STYLES,
  FILL_PATTERNS,
  FONT_FAMILIES,
  TABLE_COLUMNS,
  TABLE_COLUMN_LABELS,
  DEFAULT_TABLE_COLUMNS,
} from "@/lib/dashboardConfig";

type CategoryOption = { category: string; subcategory: string };
type Account = { id: string; name: string };
type ChartType = Exclude<WidgetType, "text">;

export type ExistingWidget = {
  id: string;
  type: WidgetType;
  title: string | null;
  config: WidgetConfig;
};

export type WidgetDraft = {
  type: WidgetType;
  title: string | null;
  result: WidgetWithData["result"];
  config: WidgetConfig | null;
};

// Which select triggered the metric builder (see the `metricBuilder` state
// below) — so a saved/edited metric routes back to the right place: the
// single Metric select, or a specific multi-series row's select.
type MetricBuilderTarget = { kind: "single" } | { kind: "series"; seriesId: string };

const CHART_TYPE_OPTIONS: { value: ChartType; label: string; Icon: typeof LineChartIcon }[] = [
  { value: "line", label: "Line", Icon: LineChartIcon },
  { value: "area", label: "Area", Icon: AreaChartIcon },
  { value: "bar", label: "Bar", Icon: BarChartIcon },
  { value: "stackedBar", label: "Stacked bar", Icon: StackedBarIcon },
  { value: "pie", label: "Pie", Icon: PieChartIcon },
  { value: "scatter", label: "Scatter", Icon: ScatterIcon },
  { value: "histogram", label: "Histogram", Icon: HistogramIcon },
  { value: "calendar", label: "Calendar", Icon: CalendarIcon },
  { value: "stat", label: "Stat", Icon: StatIcon },
  { value: "table", label: "Table", Icon: TableIcon },
];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: "spendingTotal", label: "Spending total" },
  { value: "incomeTotal", label: "Income total" },
  { value: "net", label: "Net (income − spending)" },
  { value: "transactionCount", label: "Transaction count" },
];

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "dayOfWeek", label: "Day of week" },
  { value: "merchantCategory", label: "Category" },
  { value: "merchantSubcategory", label: "Subcategory" },
  { value: "account", label: "Account" },
  { value: "merchant", label: "Merchant" },
];

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RECENT_COLORS_KEY = "dashboardWidgetRecentColors";

// What's actually in the "transactions" data source — every account draws
// from the same table, so unlike a real multi-source tool there's no
// per-account variation to show here. Purely informational (see Metric/
// Group by above for where these actually get used); D/T/# mark date/text/
// numeric the same way the very first sketch of this panel did.
// Account isn't in this list — it gets its own dropdown pinned above it
// (see the Data sources panel below), not the click-a-row pattern the rest
// of these use.
const TRANSACTION_FIELDS: { name: string; kind: "D" | "T" | "#" }[] = [
  { name: "Date", kind: "D" },
  { name: "Amount", kind: "#" },
  { name: "Merchant", kind: "T" },
  { name: "Category", kind: "T" },
  { name: "Subcategory", kind: "T" },
];

// The editor's draft form of one config.series entry (see
// lib/dashboardConfig.ts's SeriesEntryConfig) — same fields, but
// merchantCategories always a plain array (never undefined) so the UI
// doesn't need an extra null-check on every keystroke.
type SeriesDraft = {
  id: string;
  label: string;
  metric: Metric;
  customMetricId?: string;
  merchantCategories: string[];
  color?: string;
  cumulative: boolean;
  cumulativeBasis: CumulativeBasis;
};

function makeDefaultSeries(): SeriesDraft[] {
  return [
    { id: `series-${Date.now()}-1`, label: "", metric: "spendingTotal", merchantCategories: [], cumulative: false, cumulativeBasis: "range" },
    { id: `series-${Date.now()}-2`, label: "", metric: "incomeTotal", merchantCategories: [], cumulative: false, cumulativeBasis: "range" },
  ];
}

type ColumnFilterKey = "date" | "amount" | "merchant" | "category" | "subcategory";
// Every field is filterable now, independent of whatever it's also used
// for (Group By, Metric) — grouping by Category while filtering to three
// specific categories is a completely normal thing to want at once.
const COLUMN_FILTER_KEYS: Record<string, ColumnFilterKey> = {
  Date: "date",
  Amount: "amount",
  Merchant: "merchant",
  Category: "category",
  Subcategory: "subcategory",
};

function FilterChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-black/[.1] px-2 py-0.5 text-[11px] text-zinc-500 dark:border-white/[.15] dark:text-zinc-400">
      {label}
    </span>
  );
}

type DateRangeMode = "relative" | "relativeDays" | "monthsWindow" | "relativeMonth" | "ytd" | "specific" | "allTime" | "custom";

const selectClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";
const labelClasses = "text-xs text-zinc-500";
const pillClasses = (active: boolean) =>
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
  (active
    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
    : "border-black/[.12] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50");
const squareClasses = (active: boolean) =>
  "flex h-10 w-10 items-center justify-center rounded-md border transition-colors " +
  (active
    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
    : "border-black/[.12] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50");

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// `<input type="month">` shows whatever format the browser/OS picked (often
// just numbers, no obvious month name) — this spells out what's actually
// selected, e.g. "2026-07" -> "July 2026".
function formatMonthValue(value: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  return new Date(`${value}-01T00:00:00.000Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// "Today"/"Yesterday"/etc. as real dateMode options (dateRange mode
// "relativeDays" — see lib/finance.ts) rather than a one-time quick-fill
// that baked a frozen date into the custom range: this way they stay fluid,
// recomputed relative to "now" every time the widget actually renders.
const RELATIVE_DAY_OPTIONS = [
  { label: "Today", days: 0 },
  { label: "Yesterday", days: 1 },
  { label: "2 days ago", days: 2 },
  { label: "3 days ago", days: 3 },
  { label: "7 days ago", days: 7 },
  { label: "30 days ago", days: 30 },
] as const;

const LINE_STYLE_LABELS: Record<LineStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
  dotted: "Dotted",
  dashDot: "Dash-dot",
  longDash: "Long dash",
};

const FONT_FAMILY_LABELS: Record<FontFamily, string> = {
  default: "Default",
  sans: "Sans-serif",
  serif: "Serif",
  mono: "Monospace",
};

const FILL_PATTERN_LABELS: Record<FillPattern, string> = {
  solid: "Solid",
  dots: "Dots",
  diagonalLinesRight: "Diagonal ↗",
  diagonalLinesLeft: "Diagonal ↘",
  crossHatch: "Cross-hatch",
  horizontalLines: "Horizontal",
  verticalLines: "Vertical",
};

// Rendered twice in the Style section (the chart-wide default, and — only
// once something's selected in the preview — an "apply to just these"
// row), so it's its own component rather than inline JSX repeated twice.
function FillPatternButton({ pattern, active, onClick }: { pattern: FillPattern; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-xs font-medium transition-colors " +
        (active
          ? "border-zinc-900 bg-zinc-900/[.04] text-zinc-900 dark:border-zinc-50 dark:bg-zinc-50/[.08] dark:text-zinc-50 creamsicle:border-orange-600 creamsicle:bg-orange-50 creamsicle:text-orange-900"
          : "border-black/[.1] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]")
      }
    >
      <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden className="shrink-0 rounded-sm">
        <FillPatternDefs items={[{ pattern, color: "#6366f1" }]} />
        <rect width="20" height="16" rx="2" fill={resolveFill(pattern, "#6366f1")} />
      </svg>
      {FILL_PATTERN_LABELS[pattern]}
    </button>
  );
}

/**
 * Add/edit panel for one widget — a left-side drawer, not a centered modal.
 * Laid out as two columns once a type is picked: data sources on the left,
 * chart type/config and (below it) filters-and-style on the right — filters
 * stay hidden until Graph or Text is actually chosen, so a brand-new widget
 * starts as just two icons, not a wall of fields (an existing widget being
 * re-opened skips that reveal — its type was already chosen). It no longer
 * renders its own preview box: instead it reports the live config + fetched
 * result up via onDraftChange, and the actual grid slot (DashboardGrid.tsx)
 * shows the preview in place, so sizing it is just dragging/resizing that
 * same tile like any other.
 */
export function WidgetEditorPanel({
  dashboardId,
  tabId,
  accounts,
  categoryOptions,
  merchantOptions,
  calculatedMetrics: initialCalculatedMetrics,
  existing,
  ghostLayout,
  onClose,
  onSaved,
  onDraftChange,
}: {
  dashboardId: string;
  tabId: string;
  accounts: Account[];
  categoryOptions: CategoryOption[];
  merchantOptions: string[];
  calculatedMetrics: CalculatedMetricOption[];
  existing?: ExistingWidget;
  // The not-yet-real widget's current position/size in the grid (add mode
  // only) — read at Save time so the size the user dragged it to is what
  // gets created, not the API's own generic default.
  ghostLayout?: { x: number; y: number; w: number; h: number };
  onClose: () => void;
  onSaved: () => void;
  onDraftChange: (draft: WidgetDraft | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Only ever the chart half of WidgetConfig — undefined for a brand-new
  // widget or one whose stored config is a text tile. Every existing?.config
  // read below goes through this instead of touching the union directly.
  const chartConfig = existing?.config.dataSource === "transactions" ? existing.config : undefined;

  const [type, setType] = useState<WidgetType>(existing?.type ?? "bar");
  // A brand-new widget starts collapsed to just the two type icons — chart
  // config and filters/style only reveal once one is clicked. An existing
  // widget being re-opened already has a type, so skip the reveal.
  const [typeChosen, setTypeChosen] = useState(Boolean(existing));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [text, setText] = useState(existing?.config.dataSource === "text" ? existing.config.text : "");
  const [color, setColor] = useState<string | undefined>(chartConfig?.color);
  // What's actually typed in the hex text field — kept separate from
  // `color` so an in-progress, not-yet-valid value (e.g. "#12") doesn't get
  // stomped by a controlled input snapping back to the last valid color.
  const [hexDraft, setHexDraft] = useState(chartConfig?.color ?? "");
  // Last 8 colors actually applied, most-recent-first — a per-browser
  // convenience (not data that needs to sync anywhere), so localStorage
  // rather than anything server-side. Read via a lazy initializer (runs
  // once, on mount) rather than an effect — this component only ever
  // mounts client-side (opened by a button click), so `window` is always
  // there by the time it runs; guarded anyway since a private window or
  // blocked site data still throws.
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_COLORS_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.filter((c) => typeof c === "string").slice(0, 8) : [];
    } catch {
      return []; // Private window, blocked site data, etc. — recents just start empty.
    }
  });

  // Per-point coloring for bar/histogram/pie/table — the "Specific Colors"/
  // "Gradients" cards below. Mutually exclusive: switching cards doesn't
  // discard the other mode's data (so flipping back and forth doesn't lose
  // work), only which one actually lands in the saved config.
  const [colorMode, setColorMode] = useState<"none" | "specific" | "gradient">(
    chartConfig?.gradient ? "gradient" : chartConfig?.colorOverrides && Object.keys(chartConfig.colorOverrides).length > 0 ? "specific" : "none",
  );
  const [pointColors, setPointColors] = useState<Record<string, string>>(chartConfig?.colorOverrides ?? {});
  const [selectedPointKeys, setSelectedPointKeys] = useState<Set<string>>(new Set());
  const [batchHexDraft, setBatchHexDraft] = useState("");
  const [gradientFrom, setGradientFrom] = useState(chartConfig?.gradient?.from ?? GRADIENT_PRESETS[0].from);
  const [gradientTo, setGradientTo] = useState(chartConfig?.gradient?.to ?? GRADIENT_PRESETS[0].to);
  // Style — below Color: line/area stroke dash pattern, and bar/histogram/
  // pie/stackedBar/area-fill texture. Independent of which color mode (or
  // none) is active above.
  const [lineStyle, setLineStyle] = useState<LineStyle>(chartConfig?.lineStyle ?? "solid");
  const [fillPattern, setFillPattern] = useState<FillPattern>(chartConfig?.fillPattern ?? "solid");
  // Per-point pattern overrides — shares selectedPointKeys with Specific
  // Colors above (click the same bars/slices in the preview, apply either
  // a color or a pattern, or both, to that same selection).
  const [fillPatternOverrides, setFillPatternOverrides] = useState<Record<string, FillPattern>>(
    chartConfig?.fillPatternOverrides ?? {},
  );
  // Pie-only: where each slice's number is drawn. Empty string = no labels
  // at all (the pre-existing default, unchanged unless you turn this on).
  const [pieLabelShow, setPieLabelShow] = useState<"value" | "percent" | "">(chartConfig?.pieLabels?.show ?? "");
  const [pieLabelPosition, setPieLabelPosition] = useState<"inside" | "outside">(chartConfig?.pieLabels?.position ?? "outside");

  function togglePointSelected(key: string) {
    setSelectedPointKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyColorToSelected(hex: string) {
    if (selectedPointKeys.size === 0) return;
    setPointColors((prev) => {
      const next = { ...prev };
      for (const key of selectedPointKeys) next[key] = hex;
      return next;
    });
  }

  function resetPointColors() {
    setPointColors({});
    setSelectedPointKeys(new Set());
  }

  // Applies a fill pattern to whichever points are selected — same
  // selection used by applyColorToSelected above, so one click in the
  // preview sets up both a color and a pattern at once if you want.
  function applyPatternToSelected(pattern: FillPattern) {
    if (selectedPointKeys.size === 0) return;
    setFillPatternOverrides((prev) => {
      const next = { ...prev };
      for (const key of selectedPointKeys) next[key] = pattern;
      return next;
    });
  }

  function resetFillPatternOverrides() {
    setFillPatternOverrides({});
  }

  function pickColor(next: string) {
    setColor(next);
    setHexDraft(next);
    setRecentColors((prev) => {
      const updated = [next, ...prev.filter((c) => c !== next)].slice(0, 8);
      try {
        window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(updated));
      } catch {
        // Non-critical — recents just won't persist this time.
      }
      return updated;
    });
  }

  function clearColor() {
    setColor(undefined);
    setHexDraft("");
  }

  function moveDateButton(index: number, dir: -1 | 1) {
    setDateButtons((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeDateButton(index: number) {
    setDateButtons((prev) => prev.filter((_, i) => i !== index));
  }

  function addCustomDateButton() {
    const label = customButtonLabel.trim();
    if (!label || !customButtonStart || !customButtonEnd) return;
    setDateButtons((prev) => [...prev, { kind: "custom", label, start: customButtonStart, end: customButtonEnd }]);
    setCustomButtonLabel("");
    setCustomButtonStart("");
    setCustomButtonEnd("");
    setAddingCustomButton(false);
  }

  function addCustomDaysButton() {
    const n = Number(customButtonDays);
    if (!customButtonDays.trim() || !Number.isInteger(n) || n < 0 || n > 3650) return;
    if (dateButtons.some((b) => b.kind === "relativeDays" && b.days === n)) return;
    setDateButtons((prev) => [...prev, { kind: "relativeDays", days: n }]);
    setCustomButtonDays("");
    setAddingCustomDaysButton(false);
  }
  const [metric, setMetric] = useState<Metric>(chartConfig?.metric ?? "spendingTotal");
  const [customMetricId, setCustomMetricId] = useState<string | undefined>(chartConfig?.customMetricId);
  const [cumulative, setCumulative] = useState(chartConfig?.cumulative ?? false);
  const [cumulativeBasis, setCumulativeBasis] = useState<CumulativeBasis>(chartConfig?.cumulativeBasis ?? "range");

  // Multiple independent lines/bars on one chart (line/area/bar/stackedBar/
  // histogram only — see showMultiSeries below), each with its own metric +
  // category. Collapsed to just a label/name until clicked, so 4+ series
  // doesn't turn into a wall of fields. Starts at 2 (the minimum — see
  // removeSeriesLine) whenever there isn't already a saved series list to
  // restore.
  const [multiSeries, setMultiSeries] = useState(Boolean(chartConfig?.series?.length));
  const [seriesList, setSeriesList] = useState<SeriesDraft[]>(() =>
    chartConfig?.series?.length
      ? chartConfig.series.map((s) => ({
          id: s.id,
          label: s.label ?? "",
          metric: s.metric,
          customMetricId: s.customMetricId,
          merchantCategories: s.merchantCategories ?? [],
          color: s.color,
          cumulative: s.cumulative ?? false,
          cumulativeBasis: s.cumulativeBasis ?? "range",
        }))
      : makeDefaultSeries(),
  );
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);

  function addSeriesLine() {
    setSeriesList((prev) =>
      prev.length >= 6
        ? prev
        : [
            ...prev,
            { id: `series-${Date.now()}`, label: "", metric: "spendingTotal", merchantCategories: [], cumulative: false, cumulativeBasis: "range" },
          ],
    );
  }

  function removeSeriesLine(id: string) {
    // Always at least 2 while multi-series is on — dropping below that
    // isn't "multiple series" anymore, so there's no in-between state to
    // represent; toggle the checkbox off instead.
    setSeriesList((prev) => (prev.length <= 2 ? prev : prev.filter((s) => s.id !== id)));
  }

  function updateSeriesLine(id: string, patch: Partial<SeriesDraft>) {
    setSeriesList((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  // Local copy, not just the prop directly — saving a new one appends here
  // immediately so it's selectable right away, without waiting on a
  // router.refresh() to re-fetch the server-side list.
  // Create/edit form is a shared component now (CalculatedMetricForm — also
  // used by Settings' management list) rather than a form hand-built and
  // duplicated in both places; this only needs to track whether it's open
  // and hold the resulting list.
  const [calculatedMetrics, setCalculatedMetrics] = useState<CalculatedMetricOption[]>(initialCalculatedMetrics);
  // Tracks not just whether the metric builder is open, but which selector
  // triggered it (the single Metric select vs. a specific multi-series
  // row's select) and, for edit, which metric — so save routes the result
  // back to the right place. See MetricBuilderPanel, which renders in place
  // of this state.
  const [metricBuilder, setMetricBuilder] = useState<
    | { mode: "closed" }
    | { mode: "create"; target: MetricBuilderTarget }
    | { mode: "edit"; target: MetricBuilderTarget; metric: CalculatedMetricOption }
  >({ mode: "closed" });

  function handleMetricSaved(target: MetricBuilderTarget, metric: CalculatedMetricOption) {
    setCalculatedMetrics((prev) => (prev.some((m) => m.id === metric.id) ? prev.map((m) => (m.id === metric.id ? metric : m)) : [...prev, metric]));
    if (target.kind === "single") setCustomMetricId(metric.id);
    else updateSeriesLine(target.seriesId, { customMetricId: metric.id });
    setMetricBuilder({ mode: "closed" });
  }

  const [groupBy, setGroupBy] = useState<GroupBy | "">(chartConfig?.groupBy ?? "merchantCategory");
  // No UI drove this before now — bar/pie/table always used the schema's
  // own "totalDesc" default with nothing to change it. Only actually
  // surfaced today for the new stat-tile "top/bottom result" toggle below;
  // left general (not stat-only) in case a future bar/pie sort control
  // wants to reuse the same state.
  const [sort, setSort] = useState<"totalDesc" | "totalAsc" | "labelAsc">(chartConfig?.sort ?? "totalDesc");
  const [dateMode, setDateMode] = useState<DateRangeMode>(chartConfig?.dateRange.mode ?? "relative");
  const [relativeMonths, setRelativeMonths] = useState<1 | 3 | 6 | 12>(
    chartConfig?.dateRange.mode === "relative" ? chartConfig.dateRange.months : 6,
  );
  const [relativeDaysAgo, setRelativeDaysAgo] = useState<number>(
    chartConfig?.dateRange.mode === "relativeDays" ? chartConfig.dateRange.days : 1,
  );
  const [monthsWindowCount, setMonthsWindowCount] = useState<number>(
    chartConfig?.dateRange.mode === "monthsWindow" ? chartConfig.dateRange.months : 1,
  );
  const [customMonthsDraft, setCustomMonthsDraft] = useState(
    chartConfig?.dateRange.mode === "monthsWindow" ? String(chartConfig.dateRange.months) : "1",
  );
  // A single calendar month at a fixed offset — 0 is this month (still
  // filling in), 1 is last month, etc. Kept separate from
  // monthsWindow/monthsWindowCount above: that's a merged multi-month
  // range for one chart, this is one specific month, meant for several
  // widgets each pinned to a different offset (see relativeMonth's own
  // comment in lib/finance.ts).
  const [relativeMonthsAgo, setRelativeMonthsAgo] = useState<number>(
    chartConfig?.dateRange.mode === "relativeMonth" ? chartConfig.dateRange.monthsAgo : 2,
  );
  const [customMonthsAgoDraft, setCustomMonthsAgoDraft] = useState(
    chartConfig?.dateRange.mode === "relativeMonth" ? String(chartConfig.dateRange.monthsAgo) : "2",
  );
  // Only shown once "Custom" is picked within the Fluid group — a free
  // number input for any N-days-back that isn't one of the preset pills.
  const [customDaysAgoDraft, setCustomDaysAgoDraft] = useState("");
  // Explicit flag for "Custom…" being the active pill, rather than
  // inferring it from relativeDaysAgo not matching any preset — that
  // inference broke the moment relativeDaysAgo happened to already equal a
  // preset (e.g. still 30 from a prior selection): clicking Custom looked
  // like it did nothing, since the "30 days ago" pill kept showing active
  // and the input never appeared.
  const [customDaysActive, setCustomDaysActive] = useState(() => {
    const dr = chartConfig?.dateRange;
    return dr?.mode === "relativeDays" && !RELATIVE_DAY_OPTIONS.some((d) => d.days === dr.days);
  });
  const [specificMonth, setSpecificMonth] = useState(
    chartConfig?.dateRange.mode === "specific" ? chartConfig.dateRange.month : "",
  );
  const [customStart, setCustomStart] = useState(
    chartConfig?.dateRange.mode === "custom" ? chartConfig.dateRange.start : "",
  );
  const [customEnd, setCustomEnd] = useState(
    chartConfig?.dateRange.mode === "custom" ? (chartConfig.dateRange.end ?? "") : "",
  );
  // No end date at all (rather than just an empty field) means open-ended —
  // always through "now", so newly-synced transactions keep showing up
  // without ever needing to bump a fixed end date. See lib/finance.ts's
  // resolveDateRange.
  const [openEnded, setOpenEnded] = useState(
    chartConfig?.dateRange.mode === "custom" && !chartConfig.dateRange.end,
  );
  const [accountIds, setAccountIds] = useState<string[]>(chartConfig?.filters?.accountIds ?? []);
  const [merchantCategories, setMerchantCategories] = useState<string[]>(chartConfig?.filters?.merchantCategories ?? []);
  const [merchantSubcategories, setMerchantSubcategories] = useState<string[]>(
    chartConfig?.filters?.merchantSubcategories ?? [],
  );
  const [merchants, setMerchants] = useState<string[]>(chartConfig?.filters?.merchants ?? []);
  const [amountMin, setAmountMin] = useState(chartConfig?.filters?.amountMin?.toString() ?? "");
  const [amountMax, setAmountMax] = useState(chartConfig?.filters?.amountMax?.toString() ?? "");
  // Which column's filter picker is expanded under "Columns available" —
  // at most one at a time, closed (null) by default so a fresh widget
  // isn't already showing an open picker nobody asked for. Every column can
  // be filtered now, including one that's also the current Group By/Metric
  // — grouping by category and filtering to just three categories is a
  // completely normal thing to want at the same time.
  const [openColumnFilter, setOpenColumnFilter] = useState<ColumnFilterKey | null>(null);
  // Account gets its own dropdown, pinned above the rest — closed by
  // default, same reasoning as openColumnFilter above.
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [limit, setLimit] = useState(chartConfig?.limit ? String(chartConfig.limit) : "");
  const [histogramBins, setHistogramBins] = useState(String(chartConfig?.histogramBins ?? 12));
  // Table tiles only — "detail" lists individual transactions (see
  // lib/dashboardQuery.ts's `kind: "table"`) instead of the grouped rollup
  // ("summary") a table originally always was. tableColumns defaults to
  // DEFAULT_TABLE_COLUMNS when empty, same "omit the default" convention as
  // everything else here — an empty array in state still means "use the
  // default," not "show nothing."
  const [tableMode, setTableMode] = useState<"summary" | "detail">(chartConfig?.tableMode ?? "summary");
  const [tableColumns, setTableColumns] = useState<TableColumn[]>(chartConfig?.tableColumns ?? []);
  const [tableRowLimit, setTableRowLimit] = useState(String(chartConfig?.tableRowLimit ?? 100));
  const [compareToPrevious, setCompareToPrevious] = useState(chartConfig?.compareToPrevious ?? false);
  const [showMetricPeriodLabel, setShowMetricPeriodLabel] = useState(chartConfig?.showMetricPeriodLabel ?? false);
  const [showMetricTransactions, setShowMetricTransactions] = useState(chartConfig?.showMetricTransactions ?? false);
  const [xAxisLabel, setXAxisLabel] = useState(chartConfig?.axisLabels?.x ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(chartConfig?.axisLabels?.y ?? "");
  // Pixel nudge from the default position (below the X axis, left of the Y
  // axis) — set by dragging the title directly in the live preview (see
  // Widget's onAxisLabelOffsetChange), not a dropdown of fixed positions.
  const [xAxisOffset, setXAxisOffset] = useState(chartConfig?.axisLabels?.xOffset);
  const [yAxisOffset, setYAxisOffset] = useState(chartConfig?.axisLabels?.yOffset);
  const [axisFontSize, setAxisFontSize] = useState(chartConfig?.axisLabels?.fontSize ?? 11);
  // The tick labels themselves (bar names, day labels, dollar values) —
  // independent of the axis title's font size above. This is the actual
  // fix for category names squishing together once a tile gets resized
  // narrow: shrinking just the ticks buys back the room they need.
  const [xTickFontSize, setXTickFontSize] = useState(chartConfig?.axisLabels?.xTickFontSize ?? 11);
  const [yTickFontSize, setYTickFontSize] = useState(chartConfig?.axisLabels?.yTickFontSize ?? 12);
  const [fontFamily, setFontFamily] = useState<FontFamily>(chartConfig?.axisLabels?.fontFamily ?? "default");
  const [showXTicks, setShowXTicks] = useState(chartConfig?.axisLabels?.showXTicks ?? true);
  const [showYTicks, setShowYTicks] = useState(chartConfig?.axisLabels?.showYTicks ?? true);
  // Y axis value range/tick count — blank inputs mean "auto" (recharts'
  // own nice-round-numbers behavior), matching every widget saved before
  // this was configurable.
  const [yTickCount, setYTickCount] = useState(chartConfig?.axisLabels?.yTickCount ? String(chartConfig.axisLabels.yTickCount) : "");
  const [yDomainMin, setYDomainMin] = useState(chartConfig?.axisLabels?.yDomainMin !== undefined ? String(chartConfig.axisLabels.yDomainMin) : "");
  const [yDomainMax, setYDomainMax] = useState(chartConfig?.axisLabels?.yDomainMax !== undefined ? String(chartConfig.axisLabels.yDomainMax) : "");
  const [showDataLabels, setShowDataLabels] = useState(chartConfig?.showDataLabels ?? false);
  const [showGridLines, setShowGridLines] = useState(chartConfig?.showGridLines ?? true);

  function handleAxisLabelOffsetChange(axis: "x" | "y", offset: { dx: number; dy: number }) {
    if (axis === "x") setXAxisOffset(offset);
    else setYAxisOffset(offset);
  }
  const [dateButtons, setDateButtons] = useState<DateButtonConfig[]>(chartConfig?.dateButtons ?? []);
  const [showSeriesToggles, setShowSeriesToggles] = useState(chartConfig?.showSeriesToggles ?? false);
  const [addingCustomButton, setAddingCustomButton] = useState(false);
  const [customButtonLabel, setCustomButtonLabel] = useState("");
  const [customButtonStart, setCustomButtonStart] = useState("");
  const [customButtonEnd, setCustomButtonEnd] = useState("");
  const [addingCustomDaysButton, setAddingCustomDaysButton] = useState(false);
  const [customButtonDays, setCustomButtonDays] = useState("");

  const [preview, setPreview] = useState<WidgetWithData["result"] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [availableRange, setAvailableRange] = useState<{ earliest: string | null; latest: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isText = type === "text";
  const categories = useMemo(() => [...new Set(categoryOptions.map((c) => c.category))].sort(), [categoryOptions]);
  // Subcategory is its own independently filterable column now (not nested
  // under Category) — every subcategory site-wide, not scoped to whichever
  // categories happen to also be selected.
  const allSubcategories = useMemo(() => [...new Set(categoryOptions.map((c) => c.subcategory))].sort(), [categoryOptions]);

  // Scatter plots one point per raw transaction (see lib/dashboardQuery.ts)
  // instead of one point per bucket, so it has no groupBy at all — closer
  // kin to a stat tile in that respect, even though it renders a chart.
  const isScatter = type === "scatter";
  const isHistogram = type === "histogram";
  const isStackedBar = type === "stackedBar";
  const isCalendar = type === "calendar";
  const isTable = type === "table";
  // A detail table lists individual transactions (real dates, day of week,
  // merchant, etc. — see lib/dashboardQuery.ts's `kind: "table"`) instead
  // of a grouped rollup, so it has no groupBy at all — same reasoning as
  // scatter, just for a table instead of a chart.
  const isDetailTable = isTable && tableMode === "detail";
  // None of these group by a picked field the normal way: scatter and
  // histogram plot/bin raw transactions, calendar's grouping is always
  // "day" (forced below in the config useMemo, not offered as a choice),
  // and a detail table lists rows instead of grouping them.
  const needsGroupBy = !isText && !isScatter && !isHistogram && !isCalendar && !isDetailTable && type !== "stat";
  // A stat tile's own groupBy is always optional (the no-groupBy case is
  // still the plain single-number stat it always was) — but choosing one
  // turns it into a "top category"/"bottom category" style tile, showing
  // the #1 ranked result instead of a whole chart (see
  // lib/dashboardQuery.ts's `type === "stat"` branch). Kept separate from
  // needsGroupBy, which stays the *required* gate for every other type.
  const showGroupByForStat = type === "stat";
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  const showLimit = (needsGroupBy && groupBy !== "" && !isTimeSeries && (type === "bar" || type === "pie")) || isStackedBar;
  const showAxisLabels = type === "line" || type === "area" || type === "bar" || isScatter || isHistogram || isStackedBar;
  const showColor = type === "line" || type === "area" || type === "stat" || isCalendar;
  // The other coloring mode — per-point, for chart types with more than one
  // visual element at once. Mutually exclusive with showColor by type (a
  // widget is never both).
  const showMultiColor = type === "bar" || isHistogram || type === "pie" || (isTable && !isDetailTable);
  // Style section, below Color/Colors — line stroke dash pattern (line/area
  // only) and shape fill texture (anything with a solid fill to texture;
  // table/stat/calendar/scatter don't have one worth theming this way).
  const showLineStyle = type === "line" || type === "area";
  const showFillPattern = type === "bar" || isHistogram || type === "pie" || isStackedBar || type === "area";
  // "Show values" (config.showDataLabels) — every point/bar prints its own
  // number. Scatter excluded: one raw transaction per point means way too
  // many labels to be readable.
  const showDataLabelsOption = type === "line" || type === "area" || type === "bar" || isHistogram || isStackedBar;
  // Grid lines behind the chart — anything with Cartesian axes for a line to
  // align to. Excludes pie/stat/table/calendar/text, none of which have
  // axis values at all.
  const showGridLinesOption =
    type === "line" || type === "area" || type === "bar" || isHistogram || isStackedBar || isScatter;
  // Whether Color/Colors and Style each have anything to show at all — used
  // to lay them out as two side-by-side columns when both apply (so
  // picking a color doesn't push the style options below the fold), or
  // just one full-width column when only one does.
  const hasColorSection = showColor || showMultiColor;
  const hasStyleSection = showLineStyle || showFillPattern || showGridLinesOption;
  // A stat tile built on a periodic metric (period set — see
  // CalculatedMetricForm's "Compare across time periods") can show the
  // period/range the number came from, and (max/min only) the actual
  // transactions — see lib/dashboardQuery.ts's computePeriodicDetail. Off
  // by default (new UI real estate, opt-in); which checkboxes make sense
  // depends on the metric's own periodAggregation, so this reads the
  // already-loaded calculatedMetrics list rather than needing its own
  // lookup.
  const selectedMetric = customMetricId ? calculatedMetrics.find((m) => m.id === customMetricId) : undefined;
  const showMetricDetailOption = type === "stat" && Boolean(selectedMetric?.period);
  const metricHasExtreme = selectedMetric?.periodAggregation === "max" || selectedMetric?.periodAggregation === "min";
  // Whether the winning period's actual line items are worth listing — see
  // lib/dashboardQuery.ts's computePeriodicDetail: only for a row-level
  // aggregation (sum/max/min), where "the transactions behind this number"
  // is a straightforward, honest thing to show. Anything else (average,
  // median, percentile, stddev, variance, range, count) gets a plain
  // transaction count instead.
  const metricShowsLineItems =
    selectedMetric?.aggregation === "sum" || selectedMetric?.aggregation === "max" || selectedMetric?.aggregation === "min";
  // Multiple independently-configured lines/bars in place of the single
  // Metric picker — only for the chart types that can actually plot more
  // than one series at once (see computeMultiSeries in lib/dashboardQuery.ts).
  const showMultiSeries = type === "line" || type === "area" || type === "bar" || isStackedBar || isHistogram;
  // What one series actually renders as for this chart type — "Line 1"
  // reads fine for a line chart, but was showing up even for a histogram/
  // bar/stackedBar, which draw bars, not lines.
  const seriesNoun = type === "line" ? "Line" : type === "area" ? "Area" : "Bar";
  // Every account explicitly checked, individually, one at a time — not the
  // same as an empty selection (which means "no filter, use the same
  // cash-flow-account default every other page uses"). Selecting every
  // single account by hand is a real, different choice: it also includes
  // ones normally excluded from cash flow (e.g. PayPal), because the user
  // asked for them by name.
  const allAccountsChecked = accounts.length > 0 && accounts.every((a) => accountIds.includes(a.id));

  // One-line summary shown under "Date" when its picker is collapsed —
  // unlike the other columns, Date always has *some* range set, so this
  // always renders something rather than being conditional on chips.
  const dateRangeSummary =
    dateMode === "allTime"
      ? "All time"
      : dateMode === "ytd"
        ? "Year to date"
        : dateMode === "relativeDays"
          ? (RELATIVE_DAY_OPTIONS.find((d) => d.days === relativeDaysAgo)?.label ?? `${relativeDaysAgo} days ago`)
          : dateMode === "monthsWindow"
            ? describeDateRangeSelection({ mode: "monthsWindow", months: monthsWindowCount })
            : dateMode === "relativeMonth"
              ? describeDateRangeSelection({ mode: "relativeMonth", monthsAgo: relativeMonthsAgo })
              : dateMode === "specific"
                ? formatMonthValue(specificMonth) || "Pick a month"
                : dateMode === "custom"
                  ? customStart
                    ? `${formatDate(customStart)} – ${openEnded ? "latest" : customEnd ? formatDate(customEnd) : "?"}`
                    : "Pick a range"
                  : `Last ${relativeMonths} month${relativeMonths === 1 ? "" : "s"}`;

  // How many days this widget's own configured Date filter actually spans
  // — used below to decide which Date focus buttons make sense to offer on
  // the tile. A widget already narrowed to "2 days ago" has nothing wider
  // to view within it, so a "6 months" button would just be a dead end
  // (see the Date focus buttons section). allTime/an open-ended custom
  // range are unbounded; "specific" (legacy one-month widgets) is treated
  // as ~1 month.
  const widgetScopeDays = useMemo(() => {
    switch (dateMode) {
      case "relativeDays":
        return relativeDaysAgo;
      case "relative":
        return relativeMonths * 31;
      case "monthsWindow":
        return monthsWindowCount * 31;
      case "relativeMonth":
        return 31;
      case "ytd": {
        const now = new Date();
        return Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86400000);
      }
      case "specific":
        return 31;
      case "custom": {
        if (!customStart) return Infinity;
        const end = openEnded || !customEnd ? new Date() : new Date(`${customEnd}T00:00:00Z`);
        const start = new Date(`${customStart}T00:00:00Z`);
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
      }
      case "allTime":
      default:
        return Infinity;
    }
  }, [dateMode, relativeMonths, relativeDaysAgo, monthsWindowCount, customStart, customEnd, openEnded]);

  // Memoized, not recomputed-and-thrown-away every render: this is used as
  // a useEffect dependency below (both the preview fetch and the
  // onDraftChange report-up), and a fresh object literal on every render
  // would make those effects fire every render — including ones *they*
  // themselves trigger via setState, which is an infinite loop, not just
  // wasted work. Keyed on the actual primitive fields, not on anything
  // derived (`filters`, `dateRange`) that would itself be a fresh object.
  const config: WidgetConfig | null = useMemo(() => {
    if (isText) {
      return text.trim() ? { dataSource: "text", text: text.trim() } : null;
    }
    if (needsGroupBy && !groupBy) return null;
    if (dateMode === "specific" && !specificMonth) return null;
    if (dateMode === "custom" && (!customStart || (!openEnded && !customEnd))) return null;

    const dateRange: ChartWidgetConfig["dateRange"] =
      dateMode === "allTime"
        ? { mode: "allTime" }
        : dateMode === "ytd"
          ? { mode: "ytd" }
          : dateMode === "relativeDays"
            ? { mode: "relativeDays", days: relativeDaysAgo }
            : dateMode === "monthsWindow"
              ? { mode: "monthsWindow", months: monthsWindowCount }
              : dateMode === "relativeMonth"
                ? { mode: "relativeMonth", monthsAgo: relativeMonthsAgo }
                : dateMode === "specific"
                  ? { mode: "specific", month: specificMonth }
                  : dateMode === "custom"
                    ? { mode: "custom", start: customStart, ...(openEnded ? {} : { end: customEnd }) }
                    : { mode: "relative", months: relativeMonths };

    const parsedAmountMin = amountMin.trim() ? Number(amountMin) : undefined;
    const parsedAmountMax = amountMax.trim() ? Number(amountMax) : undefined;
    // Clamped/rounded here, not just left to the <input>'s own min/max/step —
    // those only constrain the native spinner and scroll-wheel stepping;
    // typing (or pasting) "1", "25", or "3.5" directly bypasses them
    // entirely, and the schema's own min(2).max(20).int() would then reject
    // the *whole* config, breaking the live preview until the field is
    // corrected — not just refusing this one value.
    const parsedYTickCountRaw = yTickCount.trim() ? Number(yTickCount) : undefined;
    const parsedYTickCount =
      parsedYTickCountRaw !== undefined && Number.isFinite(parsedYTickCountRaw)
        ? Math.min(20, Math.max(2, Math.round(parsedYTickCountRaw)))
        : undefined;
    const parsedYDomainMin = yDomainMin.trim() ? Number(yDomainMin) : undefined;
    const parsedYDomainMax = yDomainMax.trim() ? Number(yDomainMax) : undefined;

    // Every column can be filtered regardless of whether it's also the
    // current Group By/metric — "grouped by category, but only these three
    // categories" is a completely normal thing to want at the same time.
    const filters: NonNullable<ChartWidgetConfig["filters"]> = {
      ...(accountIds.length ? { accountIds } : {}),
      ...(merchantCategories.length ? { merchantCategories } : {}),
      ...(merchantSubcategories.length ? { merchantSubcategories } : {}),
      ...(merchants.length ? { merchants } : {}),
      ...(parsedAmountMin !== undefined && !Number.isNaN(parsedAmountMin) ? { amountMin: parsedAmountMin } : {}),
      ...(parsedAmountMax !== undefined && !Number.isNaN(parsedAmountMax) ? { amountMax: parsedAmountMax } : {}),
    };

    // Unlike the title text itself, tick size is worth keeping even with no
    // title set at all — shrinking bar-name text to stop it squishing
    // together is a common case with no title involved, so the guard here
    // can't be "only if a title was typed."
    const axisLabels: ChartWidgetConfig["axisLabels"] =
      showAxisLabels &&
      (xAxisLabel.trim() ||
        yAxisLabel.trim() ||
        xTickFontSize !== 11 ||
        yTickFontSize !== 12 ||
        fontFamily !== "default" ||
        !showXTicks ||
        !showYTicks ||
        parsedYTickCount !== undefined ||
        parsedYDomainMin !== undefined ||
        parsedYDomainMax !== undefined)
        ? {
            ...(xAxisLabel.trim() ? { x: xAxisLabel.trim(), xOffset: xAxisOffset } : {}),
            ...(yAxisLabel.trim() ? { y: yAxisLabel.trim(), yOffset: yAxisOffset } : {}),
            fontSize: axisFontSize,
            xTickFontSize,
            yTickFontSize,
            ...(fontFamily !== "default" ? { fontFamily } : {}),
            ...(!showXTicks ? { showXTicks: false } : {}),
            ...(!showYTicks ? { showYTicks: false } : {}),
            ...(parsedYTickCount !== undefined ? { yTickCount: parsedYTickCount } : {}),
            ...(parsedYDomainMin !== undefined && !Number.isNaN(parsedYDomainMin) ? { yDomainMin: parsedYDomainMin } : {}),
            ...(parsedYDomainMax !== undefined && !Number.isNaN(parsedYDomainMax) ? { yDomainMax: parsedYDomainMax } : {}),
          }
        : undefined;

    return {
      dataSource: "transactions",
      metric,
      ...(customMetricId ? { customMetricId } : {}),
      // The Group By control is hidden whenever the selected metric is
      // periodic (see the JSX below) — excluded here too, in case a value
      // set before switching to a periodic metric is still sitting in
      // state, so it can't silently leak into the saved config once the
      // control disappears.
      ...(needsGroupBy || (showGroupByForStat && groupBy && !selectedMetric?.period)
        ? { groupBy: groupBy as GroupBy }
        : isCalendar
          ? { groupBy: "day" as const }
          : {}),
      dateRange,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(sort !== "totalDesc" ? { sort } : {}),
      ...((showLimit || isScatter) && limit ? { limit: Number(limit) } : {}),
      // Only persist when it differs from the schema default (12) — same
      // "don't save the default" convention as every other opt-in field.
      ...(isHistogram && Number(histogramBins) !== 12 ? { histogramBins: Number(histogramBins) } : {}),
      ...(isDetailTable
        ? {
            tableMode: "detail" as const,
            ...(tableColumns.length ? { tableColumns } : {}),
            ...(Number(tableRowLimit) !== 100 ? { tableRowLimit: Number(tableRowLimit) } : {}),
          }
        : {}),
      ...(type === "stat" ? { compareToPrevious } : {}),
      ...(type === "stat" && showMetricPeriodLabel ? { showMetricPeriodLabel: true } : {}),
      ...(type === "stat" && showMetricTransactions ? { showMetricTransactions: true } : {}),
      ...(!multiSeries && isTimeSeries && cumulative
        ? { cumulative: true, ...(cumulativeBasis !== "range" ? { cumulativeBasis } : {}) }
        : {}),
      ...(axisLabels ? { axisLabels } : {}),
      ...(showColor && color ? { color } : {}),
      ...(showMultiColor && colorMode === "gradient" ? { gradient: { from: gradientFrom, to: gradientTo } } : {}),
      ...(showMultiColor && colorMode === "specific" && Object.keys(pointColors).length ? { colorOverrides: pointColors } : {}),
      ...(showLineStyle && lineStyle !== "solid" ? { lineStyle } : {}),
      ...(showFillPattern && fillPattern !== "solid" ? { fillPattern } : {}),
      ...(showFillPattern && Object.keys(fillPatternOverrides).length ? { fillPatternOverrides } : {}),
      ...(dateButtons.length ? { dateButtons } : {}),
      ...(multiSeries && showMultiSeries && seriesList.length >= 2
        ? {
            series: seriesList.map((s) => ({
              id: s.id,
              ...(s.label.trim() ? { label: s.label.trim() } : {}),
              metric: s.metric,
              ...(s.customMetricId ? { customMetricId: s.customMetricId } : {}),
              ...(s.merchantCategories.length ? { merchantCategories: s.merchantCategories } : {}),
              ...(s.color ? { color: s.color } : {}),
              ...(isTimeSeries && s.cumulative
                ? { cumulative: true, ...(s.cumulativeBasis !== "range" ? { cumulativeBasis: s.cumulativeBasis } : {}) }
                : {}),
            })),
          }
        : {}),
      ...(multiSeries && showMultiSeries && seriesList.length >= 2 && showSeriesToggles ? { showSeriesToggles: true } : {}),
      ...(type === "pie" && pieLabelShow ? { pieLabels: { show: pieLabelShow, position: pieLabelPosition } } : {}),
      ...(showDataLabelsOption && showDataLabels ? { showDataLabels: true } : {}),
      // Default is true (see chartConfigSchema) — only persist the
      // non-default "turned off" case, same as every other on-by-default flag.
      ...(showGridLinesOption && !showGridLines ? { showGridLines: false } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showLimit/needsGroupBy/showGroupByForStat/isCalendar/showAxisLabels/showColor/showMultiColor are all derived from type/metric/groupBy, already listed.
  }, [
    isText,
    text,
    type,
    metric,
    customMetricId,
    calculatedMetrics,
    cumulative,
    cumulativeBasis,
    groupBy,
    sort,
    dateMode,
    relativeMonths,
    relativeDaysAgo,
    monthsWindowCount,
    relativeMonthsAgo,
    specificMonth,
    customStart,
    customEnd,
    openEnded,
    accountIds,
    merchantCategories,
    merchantSubcategories,
    merchants,
    amountMin,
    amountMax,
    limit,
    histogramBins,
    tableMode,
    tableColumns,
    tableRowLimit,
    compareToPrevious,
    showMetricPeriodLabel,
    showMetricTransactions,
    xAxisLabel,
    yAxisLabel,
    xAxisOffset,
    yAxisOffset,
    axisFontSize,
    xTickFontSize,
    yTickFontSize,
    fontFamily,
    showXTicks,
    showYTicks,
    yTickCount,
    yDomainMin,
    yDomainMax,
    showDataLabels,
    showGridLines,
    color,
    colorMode,
    pointColors,
    gradientFrom,
    gradientTo,
    lineStyle,
    fillPattern,
    fillPatternOverrides,
    dateButtons,
    showSeriesToggles,
    multiSeries,
    seriesList,
    pieLabelShow,
    pieLabelPosition,
  ]);

  // Live preview — debounced, cancels a stale in-flight request rather than
  // letting it race a newer one and overwrite the preview with old data. A
  // text tile has no data behind it — it's a pure, synchronous derivation of
  // `text` (see the onDraftChange effect below), so it never touches this
  // effect or `preview` state at all.
  //
  // Depends on `config` itself (already the fully-computed, correctly-
  // memoized object above) rather than re-listing every field it's built
  // from a second time — that hand-maintained list drifted out of sync
  // repeatedly as fields were added (axis titles/fonts, showDataLabels,
  // showGridLines, pie labels, and now histogramBins all went in below
  // without ever reaching this effect), silently leaving the live preview
  // stale for exactly the field someone had just added a control for.
  useEffect(() => {
    if (!config || config.dataSource === "text") return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/dashboards/widgets/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, config }),
        });
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json();
          setPreview(body.result);
        } else {
          // Logged rather than surfaced — the on-tile message stays a plain
          // "couldn't load," but the actual reason (usually a field value
          // the schema rejects, e.g. out of an allowed range) still shows up
          // in the console for whoever's debugging it.
          const body = await res.json().catch(() => null);
          console.error("Widget preview request failed", res.status, body);
          setPreview({ error: "Couldn't load a preview for this configuration." });
        }
      } catch {
        if (!cancelled) setPreview({ error: "Network error." });
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [type, config]);

  // Shared by the dedicated preview panel below (rendered right next to the
  // form, since the actual grid tile can be scrolled away or hard to spot)
  // and by the onDraftChange report-up just after it (which still drives
  // the in-place ghost-tile preview in the real grid). Memoized so its
  // identity only changes when one of these actually does — otherwise it'd
  // be a fresh object every render, defeating the effect below the same way
  // an inline literal would.
  const draftResult: WidgetWithData["result"] = useMemo(() => {
    if (!config) return { error: isText ? "Type something to see a preview." : "Fill in the fields to see a preview." };
    if (config.dataSource === "text") return { kind: "text", text: config.text };
    return preview ?? { error: previewLoading ? "Loading…" : "Fill in the fields to see a preview." };
  }, [config, isText, preview, previewLoading]);

  // Reports the current draft up to DashboardGrid, which renders it in the
  // actual grid slot too — sizing/dragging the ghost tile still works the
  // same way. Runs whenever anything the preview depends on changes, and
  // clears on unmount so closing the panel drops the in-place preview too.
  useEffect(() => {
    onDraftChange({ type, title: title.trim() || null, result: draftResult, config });
    return () => onDraftChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDraftChange is a stable setter from the parent; draftResult is derived fresh from config/preview/previewLoading/isText every render, all already tracked.
  }, [type, title, config, draftResult]);

  // The available date range depends on which accounts are in scope —
  // different accounts can have very different histories (see
  // app/api/dashboards/widgets/date-range/route.ts) — so it's re-asked
  // whenever the account filter changes, debounced the same way. Meaningless
  // for a text tile, so skipped entirely.
  useEffect(() => {
    if (isText) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/dashboards/widgets/date-range", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountIds: accountIds.length ? accountIds : undefined }),
        });
        if (cancelled) return;
        if (res.ok) setAvailableRange(await res.json());
      } catch {
        // Non-critical — just a hint text, fine to silently skip on failure.
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [isText, accountIds]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        type,
        title: title.trim() || null,
        config,
        ...(existing ? {} : { layout: ghostLayout }),
      };
      const res = existing
        ? await fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}/widgets/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}/widgets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setError(errBody?.error ?? `Failed to save (${res.status}).`);
        return;
      }
      onSaved();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  function pickType(next: WidgetType) {
    setType(next);
    setTypeChosen(true);
  }

  return (
    <>
      {/* Click-outside-to-close, but no dimming overlay — the grid behind
          the drawer is exactly what's being configured (the ghost tile's
          live preview, or the widget you're editing in place), so it needs
          to stay fully visible, not darkened. */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={
          "fixed inset-y-0 left-0 z-30 flex w-full max-w-xl flex-col gap-4 overflow-y-auto border-r border-black/[.1] bg-[var(--background)] p-5 shadow-xl transition-transform duration-200 ease-out dark:border-white/[.15] creamsicle:border-orange-300 " +
          (mounted ? "translate-x-0" : "-translate-x-full")
        }
      >
        {/* No heading here on purpose — "Add widget"/"Edit widget" was just
            a label the drawer's own presence already makes obvious, and
            dropping it lets everything below start higher up. The close
            button floats in the corner instead of taking its own row. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ✕
        </button>

        <label className="flex flex-col gap-1 pr-8">
          <span className={labelClasses}>Title (optional — auto-generated if left blank)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={selectClasses} />
          {!isText && (
            <p className="text-[11px] text-zinc-500">
              Type <code className="rounded bg-black/[.06] px-1 py-0.5 dark:bg-white/[.1]">{TITLE_DATE_TOKEN}</code>{" "}
              anywhere in the title to keep that spot live-updated with the date range — resolves to{" "}
              <strong>“{dateRangeSummary}”</strong> right now.{" "}
              <button
                type="button"
                onClick={() => setTitle((prev) => (prev.trim() ? `${prev.trim()} ${TITLE_DATE_TOKEN}` : TITLE_DATE_TOKEN))}
                className="text-zinc-700 underline hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                Insert
              </button>
            </p>
          )}
        </label>

        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-4">
          {/* Left column: every field, each independently filterable — click
              one to open its picker. Hidden for a text tile, which has no
              data behind it at all. Stays fully interactive while the
              metric builder is open (unlike the right column below) —
              Account and Date here are exactly what the builder's live
              preview is scoped to, so changing them while you build is
              meant to work, not be blocked. */}
          {!isText && (
            <div className="flex flex-col gap-1 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
              <span className={labelClasses}>Data sources — click a column to filter by it</span>

              {/* Pinned above the rest, not folded into the click-a-column
                  list below — accounts are more "which data feeds this at
                  all" than a per-value filter, so it stays a dropdown up
                  top like before. */}
              <div className="mb-1 flex flex-col gap-1 border-b border-black/[.06] pb-2 dark:border-white/[.08]">
                <button
                  type="button"
                  onClick={() => setAccountDropdownOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-xs text-zinc-600 hover:bg-black/[.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-100"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-3 font-mono font-medium text-zinc-400 dark:text-zinc-500">T</span>
                    <span>Account</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-zinc-500">
                    {accountIds.length === 0
                      ? "All accounts"
                      : accountIds.length === 1
                        ? (accounts.find((a) => a.id === accountIds[0])?.name ?? "1 selected")
                        : `${accountIds.length} selected`}
                    <span aria-hidden="true">{accountDropdownOpen ? "▾" : "▸"}</span>
                  </span>
                </button>
                {accountDropdownOpen && (
                  <div className="flex flex-col gap-1 py-1 pl-5">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={allAccountsChecked || accountIds.length === 0}
                        onChange={() => setAccountIds([])}
                      />
                      All connected accounts
                    </label>
                    {accounts.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={accountIds.includes(a.id)}
                          onChange={(e) =>
                            setAccountIds((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                          }
                        />
                        {a.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {TRANSACTION_FIELDS.map((f) => {
                const filterKey = COLUMN_FILTER_KEYS[f.name];
                // Highlights the column(s) actually powering this graph
                // right now — Amount via whichever metric is picked (every
                // metric operates on it), everything else via groupBy. At a
                // glance, this shows what's *driving* the chart — separate
                // from whether it's also filtered, which every column can
                // be regardless (grouping by Category while also filtering
                // to three specific categories is completely normal).
                const isUsedInGraph =
                  f.name === "Amount"
                    ? true
                    : f.name === "Date"
                      ? groupBy === "day" || groupBy === "month"
                      : f.name === "Merchant"
                        ? groupBy === "merchant"
                        : f.name === "Category"
                          ? groupBy === "merchantCategory"
                          : f.name === "Subcategory"
                            ? groupBy === "merchantSubcategory"
                            : false;
                const isOpen = openColumnFilter === filterKey;
                return (
                  <div
                    key={f.name}
                    className={
                      "rounded " +
                      (isUsedInGraph
                        ? "border-l-2 border-indigo-500 bg-indigo-500/[.06] creamsicle:border-orange-500 creamsicle:bg-orange-500/[.08]"
                        : "border-l-2 border-transparent")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setOpenColumnFilter((prev) => (prev === filterKey ? null : filterKey))}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs text-zinc-600 hover:bg-black/[.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-100"
                    >
                      <span className="w-3 font-mono font-medium text-zinc-400 dark:text-zinc-500">{f.kind}</span>
                      <span className="flex-1 text-left">{f.name}</span>
                    </button>

                    {/* Persistent, collapsed summary of this column's active
                        filter — visible whether or not the picker itself is
                        open, so you can see what's filtered without
                        re-opening every column. The picker to add more
                        still only appears while open (below). */}
                    {!isOpen && (
                      <div className="flex flex-wrap gap-1 py-1 pl-5 empty:hidden">
                        {f.name === "Date" && (
                          <span className="text-[11px] text-zinc-500">{dateRangeSummary}</span>
                        )}
                        {f.name === "Amount" &&
                          (amountMin || amountMax) &&
                          [
                            amountMin ? `min $${amountMin}` : null,
                            amountMax ? `max $${amountMax}` : null,
                          ]
                            .filter((v): v is string => v !== null)
                            .map((label) => <FilterChip key={label} label={label} />)}
                        {f.name === "Category" && merchantCategories.map((c) => <FilterChip key={c} label={formatCategoryLabel(c)} />)}
                        {f.name === "Subcategory" &&
                          merchantSubcategories.map((s) => <FilterChip key={s} label={formatCategoryLabel(s)} />)}
                        {f.name === "Merchant" && merchants.map((m) => <FilterChip key={m} label={m} />)}
                      </div>
                    )}

                    {isOpen && filterKey === "date" && (
                      <div className="flex flex-col gap-2.5 py-1 pl-5">
                        <div className="flex flex-wrap gap-3">
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-[11px] text-zinc-500">
                              Fluid — recalculated from today every time this is viewed
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {([1, 3, 6, 12] as const).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => {
                                    setDateMode("relative");
                                    setRelativeMonths(m);
                                    setCustomDaysActive(false);
                                  }}
                                  className={pillClasses(dateMode === "relative" && relativeMonths === m)}
                                >
                                  {m}mo
                                </button>
                              ))}
                              {RELATIVE_DAY_OPTIONS.map((d) => (
                                <button
                                  key={d.label}
                                  type="button"
                                  onClick={() => {
                                    setDateMode("relativeDays");
                                    setRelativeDaysAgo(d.days);
                                    setCustomDaysActive(false);
                                  }}
                                  className={pillClasses(dateMode === "relativeDays" && !customDaysActive && relativeDaysAgo === d.days)}
                                >
                                  {d.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setDateMode("ytd");
                                  setCustomDaysActive(false);
                                }}
                                className={pillClasses(dateMode === "ytd")}
                              >
                                Year to date
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDateMode("allTime");
                                  setCustomDaysActive(false);
                                }}
                                className={pillClasses(dateMode === "allTime")}
                              >
                                All time
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDateMode("relativeDays");
                                  setCustomDaysActive(true);
                                  setCustomDaysAgoDraft(String(relativeDaysAgo));
                                }}
                                className={pillClasses(dateMode === "relativeDays" && customDaysActive)}
                              >
                                Custom…
                              </button>
                              <span aria-hidden className="h-5 w-px shrink-0 bg-black/[.12] dark:bg-white/[.15]" />
                              <button
                                type="button"
                                onClick={() => {
                                  setDateMode("monthsWindow");
                                  setCustomMonthsDraft(String(monthsWindowCount));
                                }}
                                className={pillClasses(dateMode === "monthsWindow")}
                                title="The N most recently completed calendar months — 1 is exactly last month"
                              >
                                Past N months…
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDateMode("relativeMonth");
                                  setCustomMonthsAgoDraft(String(relativeMonthsAgo));
                                }}
                                className={pillClasses(dateMode === "relativeMonth")}
                                title="Pin this tile to one specific month-offset from today (0 = this month) — several tiles at different offsets stay lined up and all shift forward together as the calendar turns"
                              >
                                N months ago…
                              </button>
                            </div>
                            {dateMode === "relativeDays" && customDaysActive && (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={3650}
                                  value={customDaysAgoDraft}
                                  autoFocus
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCustomDaysAgoDraft(v);
                                    const n = Number(v);
                                    if (v.trim() && Number.isInteger(n) && n >= 0 && n <= 3650) setRelativeDaysAgo(n);
                                  }}
                                  placeholder="45"
                                  className={selectClasses + " w-20"}
                                />
                                <span className="text-xs text-zinc-500">days ago, through today</span>
                              </div>
                            )}
                            {dateMode === "monthsWindow" && (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={24}
                                  value={customMonthsDraft}
                                  autoFocus
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCustomMonthsDraft(v);
                                    const n = Number(v);
                                    if (v.trim() && Number.isInteger(n) && n >= 1 && n <= 24) setMonthsWindowCount(n);
                                  }}
                                  placeholder="4"
                                  className={selectClasses + " w-20"}
                                />
                                <span className="text-xs text-zinc-500">most recently completed months</span>
                              </div>
                            )}
                            {dateMode === "relativeMonth" && (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={36}
                                  value={customMonthsAgoDraft}
                                  autoFocus
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCustomMonthsAgoDraft(v);
                                    const n = Number(v);
                                    if (v.trim() && Number.isInteger(n) && n >= 0 && n <= 36) setRelativeMonthsAgo(n);
                                  }}
                                  placeholder="2"
                                  className={selectClasses + " w-20"}
                                />
                                <span className="text-xs text-zinc-500">months ago (0 = this month)</span>
                              </div>
                            )}
                          </div>

                          <span aria-hidden className="w-px shrink-0 self-stretch bg-black/[.12] dark:bg-white/[.15]" />

                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="text-[11px] text-zinc-500">Fixed — an exact range that doesn&apos;t move</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button type="button" onClick={() => setDateMode("custom")} className={pillClasses(dateMode === "custom")}>
                                Custom range
                              </button>
                            </div>
                            {dateMode === "specific" && (
                              // Legacy "one month" widgets saved before this mode was
                              // retired from the picker — still editable so an old
                              // config doesn't strand its owner, just no longer a way
                              // to newly enter this mode.
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="month"
                                  value={specificMonth}
                                  onChange={(e) => setSpecificMonth(e.target.value)}
                                  className={selectClasses}
                                />
                                {formatMonthValue(specificMonth) && (
                                  <span className="text-xs text-zinc-500">{formatMonthValue(specificMonth)}</span>
                                )}
                                <button type="button" onClick={() => setDateMode("custom")} className="text-xs text-indigo-600 underline dark:text-indigo-400">
                                  Switch to custom range
                                </button>
                              </div>
                            )}
                            {dateMode === "custom" && (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={selectClasses} />
                                  <span className="text-xs text-zinc-500">to</span>
                                  <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    disabled={openEnded}
                                    className={selectClasses + (openEnded ? " opacity-40" : "")}
                                  />
                                </div>
                                <label className="flex items-center gap-2">
                                  <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
                                  <span className="text-sm">No end date — always include the latest data</span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>

                        {availableRange?.earliest && availableRange?.latest && (
                          <p className="text-[11px] text-zinc-500">
                            Data available: {formatDate(availableRange.earliest)} – {formatDate(availableRange.latest)}
                            {accountIds.length > 0 ? " for the selected accounts" : ""}
                          </p>
                        )}
                      </div>
                    )}

                    {isOpen && filterKey === "amount" && (
                      <div className="flex items-center gap-2 py-1 pl-5">
                        <input
                          type="number"
                          value={amountMin}
                          onChange={(e) => setAmountMin(e.target.value)}
                          placeholder="Min $"
                          className={selectClasses + " w-24"}
                        />
                        <span className="text-xs text-zinc-500">to</span>
                        <input
                          type="number"
                          value={amountMax}
                          onChange={(e) => setAmountMax(e.target.value)}
                          placeholder="Max $"
                          className={selectClasses + " w-24"}
                        />
                      </div>
                    )}

                    {isOpen && filterKey === "category" && (
                      <div className="flex flex-col gap-1 py-1 pl-5">
                        <SearchableSelect
                          value=""
                          onChange={(v) => setMerchantCategories((prev) => (prev.includes(v) ? prev : [...prev, v]))}
                          options={categories
                            .filter((c) => !merchantCategories.includes(c))
                            .map((c) => ({ value: c, label: formatCategoryLabel(c) }))}
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
                    )}

                    {isOpen && filterKey === "subcategory" && (
                      <div className="flex flex-col gap-1 py-1 pl-5">
                        <SearchableSelect
                          value=""
                          onChange={(v) => setMerchantSubcategories((prev) => (prev.includes(v) ? prev : [...prev, v]))}
                          options={allSubcategories
                            .filter((s) => !merchantSubcategories.includes(s))
                            .map((s) => ({ value: s, label: formatCategoryLabel(s) }))}
                          placeholder="Add subcategory…"
                        />
                        {merchantSubcategories.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {merchantSubcategories.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setMerchantSubcategories((prev) => prev.filter((x) => x !== s))}
                                className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                              >
                                {formatCategoryLabel(s)} ✕
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isOpen && filterKey === "merchant" && (
                      <div className="flex flex-col gap-1 py-1 pl-5">
                        <SearchableSelect
                          value=""
                          onChange={(v) => setMerchants((prev) => (prev.includes(v) ? prev : [...prev, v]))}
                          options={merchantOptions.filter((m) => !merchants.includes(m)).map((m) => ({ value: m, label: m }))}
                          placeholder="Add merchant…"
                        />
                        {merchants.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {merchants.map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setMerchants((prev) => prev.filter((x) => x !== m))}
                                className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                              >
                                {m} ✕
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Right column: what kind of tile, then (once picked) its
              type-specific config, then filters/style below that. `relative`
              hosts the metric-builder overlay below — unlike the left
              column, none of this (the widget's own Type/Metric/Group by)
              feeds the metric being built, so it's the one blurred out
              while the builder is open (desktop only — see the overlay's
              own comment for why not on mobile, where this same space is
              the builder itself). */}
          <div className={"relative flex flex-col gap-3" + (isText ? " col-span-2" : "")}>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => pickType("bar")}
                className={squareClasses(typeChosen && !isText)}
                title="Graph"
                aria-label="Graph"
              >
                <GraphIcon />
              </button>
              <button
                type="button"
                onClick={() => pickType("text")}
                className={squareClasses(typeChosen && isText)}
                title="Text"
                aria-label="Text"
              >
                <TextIcon />
              </button>
            </div>

            {typeChosen && isText && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type what this tile should say"
                rows={4}
                className={selectClasses}
              />
            )}

            {typeChosen && !isText && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {CHART_TYPE_OPTIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={squareClasses(type === value)}
                      title={label}
                      aria-label={label}
                    >
                      <Icon />
                    </button>
                  ))}
                </div>

                {showMultiSeries && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={multiSeries} onChange={(e) => setMultiSeries(e.target.checked)} />
                    <span className="text-sm">Multiple series (e.g. two {seriesNoun.toLowerCase()}s on one chart)</span>
                  </label>
                )}

                {multiSeries && showMultiSeries ? (
                  <div className="flex flex-col gap-2">
                    <span className={labelClasses}>Series</span>
                    {seriesList.map((s, i) => {
                      const isExpanded = expandedSeriesId === s.id;
                      const displayName = s.label.trim() || `${seriesNoun} ${i + 1}`;
                      return (
                        <div key={s.id} className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-2 dark:border-white/[.1]">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedSeriesId(isExpanded ? null : s.id)}
                              className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium"
                            >
                              <span className={"inline-block transition-transform " + (isExpanded ? "rotate-90" : "")}>›</span>
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? colorForKey(s.id) }} />
                              {displayName}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSeriesLine(s.id)}
                              disabled={seriesList.length <= 2}
                              title={seriesList.length <= 2 ? "Uncheck “Multiple series” to go back to a single series" : `Remove ${displayName}`}
                              aria-label={`Remove ${displayName}`}
                              className="text-zinc-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:text-red-400"
                            >
                              ✕
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="flex flex-col gap-2 pl-4">
                              <input
                                type="text"
                                value={s.label}
                                onChange={(e) => updateSeriesLine(s.id, { label: e.target.value })}
                                placeholder={`${seriesNoun} ${i + 1} (optional name)`}
                                className={selectClasses}
                              />
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={s.customMetricId ? `custom:${s.customMetricId}` : s.metric}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === "__new__") {
                                      setMetricBuilder({ mode: "create", target: { kind: "series", seriesId: s.id } });
                                      return;
                                    }
                                    if (v.startsWith("custom:")) updateSeriesLine(s.id, { customMetricId: v.slice("custom:".length) });
                                    else updateSeriesLine(s.id, { metric: v as Metric, customMetricId: undefined });
                                  }}
                                  className={selectClasses + " flex-1"}
                                >
                                  {METRIC_OPTIONS.filter((o) => !isHistogram || o.value !== "transactionCount").map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                  {!isHistogram && (
                                    <>
                                      {calculatedMetrics.length > 0 && (
                                        <optgroup label="Your metrics">
                                          {calculatedMetrics.map((m) => (
                                            <option key={m.id} value={`custom:${m.id}`}>
                                              {m.name}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      <option value="__new__">+ New calculated metric…</option>
                                    </>
                                  )}
                                </select>
                                {s.customMetricId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const m = calculatedMetrics.find((m) => m.id === s.customMetricId);
                                      if (m) setMetricBuilder({ mode: "edit", target: { kind: "series", seriesId: s.id }, metric: m });
                                    }}
                                    title="Edit this metric"
                                    aria-label="Edit this metric"
                                    className="shrink-0 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                                  >
                                    ✎
                                  </button>
                                )}
                              </div>
                              {/* Quick whole-widget measures — none of the actual
                                  merchant categories below represent income (income
                                  transactions aren't assigned a spending category),
                                  so this is the only way to plot an income or net
                                  line. Picking one clears any categories already
                                  added, since "all of X" and "just these categories"
                                  are mutually exclusive scopes for the same line. */}
                              <div className="flex flex-wrap gap-1">
                                {(
                                  [
                                    ["spendingTotal", "All spending"],
                                    ["incomeTotal", "All income"],
                                    ["net", "Net"],
                                  ] as const
                                ).map(([m, label]) => {
                                  const isActive = !s.customMetricId && s.metric === m && s.merchantCategories.length === 0;
                                  return (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => updateSeriesLine(s.id, { metric: m, customMetricId: undefined, merchantCategories: [] })}
                                      className={pillClasses(isActive)}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                              <SearchableSelect
                                value=""
                                onChange={(v) =>
                                  updateSeriesLine(s.id, {
                                    merchantCategories: s.merchantCategories.includes(v) ? s.merchantCategories : [...s.merchantCategories, v],
                                  })
                                }
                                options={categories
                                  .filter((c) => !s.merchantCategories.includes(c))
                                  .map((c) => ({ value: c, label: formatCategoryLabel(c) }))}
                                placeholder="…or narrow to specific categories"
                              />
                              {s.merchantCategories.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {s.merchantCategories.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() =>
                                        updateSeriesLine(s.id, { merchantCategories: s.merchantCategories.filter((x) => x !== c) })
                                      }
                                      className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                                    >
                                      {formatCategoryLabel(c)} ✕
                                    </button>
                                  ))}
                                </div>
                              )}
                              {isTimeSeries && (
                                <div className="flex flex-col gap-1.5">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={s.cumulative}
                                      onChange={(e) => updateSeriesLine(s.id, { cumulative: e.target.checked })}
                                    />
                                    <span className="text-sm">Running total instead of per-{groupBy}</span>
                                  </label>
                                  {s.cumulative && (
                                    <div className="flex flex-wrap gap-1 pl-6">
                                      {(
                                        [
                                          ["range", "Start at 0 for this range"],
                                          ["lifetime", "Continue from before this range"],
                                        ] as const
                                      ).map(([basis, label]) => (
                                        <button
                                          key={basis}
                                          type="button"
                                          onClick={() => updateSeriesLine(s.id, { cumulativeBasis: basis })}
                                          className={pillClasses(s.cumulativeBasis === basis)}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              <label className="flex items-center gap-2">
                                <span className="text-[11px] text-zinc-500">Color</span>
                                <input
                                  type="color"
                                  value={s.color ?? colorForKey(s.id)}
                                  onChange={(e) => updateSeriesLine(s.id, { color: e.target.value })}
                                  className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {seriesList.length < 6 && (
                      <button type="button" onClick={addSeriesLine} className={pillClasses(false) + " self-start"}>
                        + Add {seriesNoun.toLowerCase()}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className={labelClasses}>Metric</span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={customMetricId ? `custom:${customMetricId}` : metric}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__new__") {
                              setMetricBuilder({ mode: "create", target: { kind: "single" } });
                              return;
                            }
                            if (v.startsWith("custom:")) {
                              setCustomMetricId(v.slice("custom:".length));
                              return;
                            }
                            setCustomMetricId(undefined);
                            setMetric(v as Metric);
                          }}
                          className={selectClasses + " flex-1"}
                        >
                          {/* "Transaction count" is meaningless per-transaction —
                              every scatter point or histogram sample is exactly
                              one, so it'd produce a flat line of dots or a single
                              useless bin. Hidden rather than allowed through. */}
                          {METRIC_OPTIONS.filter((o) => !(isScatter || isHistogram) || o.value !== "transactionCount").map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                          {/* Saved metrics apply to bucketed/stat results only —
                              scatter plots raw transactions and histogram bins by
                              magnitude, neither of which has a "sum vs. average"
                              distinction to offer. */}
                          {!isScatter && !isHistogram && !isStackedBar && (
                            <>
                              {calculatedMetrics.length > 0 && (
                                <optgroup label="Your metrics">
                                  {calculatedMetrics.map((m) => (
                                    <option key={m.id} value={`custom:${m.id}`}>
                                      {m.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <option value="__new__">+ New calculated metric…</option>
                            </>
                          )}
                        </select>
                        {selectedMetric && (
                          <button
                            type="button"
                            onClick={() => setMetricBuilder({ mode: "edit", target: { kind: "single" }, metric: selectedMetric })}
                            title="Edit this metric"
                            aria-label="Edit this metric"
                            className="shrink-0 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                          >
                            ✎
                          </button>
                        )}
                      </div>
                    </label>

                    {isTimeSeries && (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={cumulative} onChange={(e) => setCumulative(e.target.checked)} />
                          <span className="text-sm">Running total instead of per-{groupBy}</span>
                        </label>
                        {cumulative && (
                          <div className="flex flex-wrap gap-1 pl-6">
                            {(
                              [
                                ["range", "Start at 0 for this range"],
                                ["lifetime", "Continue from before this range"],
                              ] as const
                            ).map(([basis, label]) => (
                              <button
                                key={basis}
                                type="button"
                                onClick={() => setCumulativeBasis(basis)}
                                className={pillClasses(cumulativeBasis === basis)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Below `lg` (1024px), the takeover panel below (the
                    fixed-position "Preview" panel, hidden below that
                    breakpoint) doesn't exist to take over — this renders the
                    same MetricBuilderPanel inline instead, right where the
                    picker that opened it lives. Unconditional on
                    multiSeries/single now (target tracks which one opened
                    it), unlike the old single-select-only inline form this
                    replaced. */}
                {metricBuilder.mode !== "closed" && (
                  <div className="lg:hidden">
                    <MetricBuilderPanel
                      variant="inline"
                      initial={metricBuilder.mode === "edit" ? metricBuilder.metric : undefined}
                      categoryOptions={categoryOptions}
                      scope={{ accountIds, dateRange: config?.dataSource === "transactions" ? config.dateRange : undefined }}
                      onSaved={(metric) => handleMetricSaved(metricBuilder.target, metric)}
                      onCancel={() => setMetricBuilder({ mode: "closed" })}
                    />
                  </div>
                )}

                {/* Table tiles only — "Summary" is a table's original
                    behavior (the same grouped rows a bar/pie would show, as
                    text — still uses Group By below). "Detail" lists
                    individual transactions instead, with real dates (see
                    lib/dashboardQuery.ts's `kind: "table"`) — the only
                    place in the app you can see an actual transaction date
                    and day of week side by side, not a bucketed one. */}
                {isTable && (
                  <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
                    <span className={labelClasses}>Table shows</span>
                    <div className="flex gap-1.5">
                      {(
                        [
                          ["summary", "Summary (grouped)"],
                          ["detail", "Detail (individual transactions)"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button key={mode} type="button" onClick={() => setTableMode(mode)} className={pillClasses(tableMode === mode)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {isDetailTable && (
                      <>
                        <span className={labelClasses + " mt-1"}>Columns</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {TABLE_COLUMNS.map((c) => {
                            const active = tableColumns.length ? tableColumns.includes(c) : DEFAULT_TABLE_COLUMNS.includes(c);
                            return (
                              <label key={c} className="flex items-center gap-1.5 text-sm">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={(e) =>
                                    setTableColumns((prev) => {
                                      const base = prev.length ? prev : DEFAULT_TABLE_COLUMNS;
                                      return e.target.checked ? [...base, c] : base.filter((x) => x !== c);
                                    })
                                  }
                                />
                                {TABLE_COLUMN_LABELS[c]}
                              </label>
                            );
                          })}
                        </div>
                        <label className="mt-1 flex flex-col gap-1">
                          <span className={labelClasses}>Rows (most recent first)</span>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={tableRowLimit}
                            onChange={(e) => setTableRowLimit(e.target.value)}
                            className={selectClasses + " w-24"}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}

                {/* A periodic metric ("Compare across time periods" — see
                    CalculatedMetricForm) already does its own bucketing
                    internally (see lib/dashboardQuery.ts's
                    computeCustomMetricValue). Also setting Group By here
                    would layer a second, unrelated "rank every bucket, show
                    the #1 result" behavior on top of it — e.g. picking
                    "Average" + Group By: Day doesn't give you "average
                    spending per day," it gives you "which single day had
                    the highest average transaction," an easy trap since
                    both features happen to mention "day." Hiding the
                    control here (rather than just warning) makes the two
                    impossible to accidentally combine. */}
                {showGroupByForStat && selectedMetric?.period ? (
                  <p className="text-[11px] text-zinc-500">
                    &ldquo;{selectedMetric.name}&rdquo; already breaks itself down by {selectedMetric.period} — see the Detail
                    section below for its own date/range and transaction options, instead of Group By.
                  </p>
                ) : (
                  (needsGroupBy || showGroupByForStat) && (
                    <label className="flex flex-col gap-1">
                      <span className={labelClasses}>Group by</span>
                      <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={selectClasses}>
                        {/* For a stat tile, blank is a real choice ("just
                            the plain total"), not a placeholder — picking a
                            group turns it into a "top result" tile instead
                            (see lib/dashboardQuery.ts). Every other type
                            still requires an actual pick. */}
                        <option value="" disabled={!showGroupByForStat}>
                          {showGroupByForStat ? "Just the total (no grouping)" : "Select…"}
                        </option>
                        {GROUP_BY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {showGroupByForStat && groupBy && (
                        <label className="flex items-center gap-2 pt-0.5">
                          <input type="checkbox" checked={sort === "totalAsc"} onChange={(e) => setSort(e.target.checked ? "totalAsc" : "totalDesc")} />
                          <span className="text-[11px] text-zinc-500">
                            Show the lowest instead of the highest {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label.toLowerCase()}
                          </span>
                        </label>
                      )}
                    </label>
                  )
                )}

                {(showLimit || isScatter) && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClasses}>
                      {isScatter
                        ? "Max points (most recent)"
                        : isStackedBar
                          ? 'Top N categories to stack (rest folds into "Other")'
                          : 'Top N (rest folds into "Other")'}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={isScatter ? 1000 : 100}
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder="No limit"
                      className={selectClasses}
                    />
                  </label>
                )}

                {isHistogram && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClasses}>Buckets (was fixed at 12)</span>
                    <input
                      type="number"
                      min={4}
                      max={30}
                      value={histogramBins}
                      onChange={(e) => setHistogramBins(e.target.value)}
                      className={selectClasses}
                    />
                  </label>
                )}

                {type === "stat" && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={compareToPrevious} onChange={(e) => setCompareToPrevious(e.target.checked)} />
                    <span className="text-sm">Compare to prior period</span>
                  </label>
                )}

              </>
            )}

            {/* Only this column (the widget's own Type/Metric/Group by/
                Series/Buttons/etc.) gets covered — Data sources to the left
                stays fully live, since Account and Date there are exactly
                what the builder's preview is scoped to; changing them here
                while you build is meant to work. `hidden lg:flex`: below
                `lg` there's no separate builder panel to protect this
                column *from* — the builder replaces this same space inline
                instead (see the `lg:hidden` MetricBuilderPanel above), so
                blurring it there would hide the thing you're using. */}
            {metricBuilder.mode !== "closed" && (
              <div className="absolute inset-0 z-10 hidden items-start justify-center rounded-lg bg-[var(--background)]/85 pt-12 backdrop-blur-[2px] lg:flex">
                <div className="mx-4 max-w-xs rounded-lg border border-black/[.1] bg-[var(--background)] p-4 text-center shadow-lg dark:border-white/[.15]">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Building a metric</p>
                  <p className="mt-1.5 text-[13px] text-zinc-600 dark:text-zinc-300">
                    None of this widget&rsquo;s own type/metric/grouping affects the metric you&rsquo;re building on the right. Its Account and
                    Date, on the left, still do — feel free to adjust those as you go.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-auto flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-black/[.1] px-4 py-2 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!config || saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* A dedicated, always-in-the-same-spot preview, docked to the
          drawer's own right edge and stretched to fill the rest of the
          screen — the actual grid slot this widget will occupy (still
          driven by the same draft via onDraftChange, for sizing/dragging)
          can end up scrolled away, or just too small to read while you're
          mid-edit. Translucent + backdrop-blur rather than a solid panel:
          the real dashboard grid is still visible (softened, not a hard
          cut) behind it instead of being fully hidden. A sibling of the
          drawer, not a child: the drawer's overflow-y-auto implicitly clips
          overflow-x too (a real CSS quirk — declaring only one axis forces
          the other to `auto` as well), so an absolutely-positioned child
          would just get cut off. left-[36rem] matches the drawer's own
          max-w-xl exactly, which is safe only because this whole panel is
          hidden below `lg` (1024px) — comfortably wider than the drawer's
          576px cap, so the drawer is always at that exact width whenever
          this is visible. Hidden below `lg` at all: the drag/resize grid
          builder is a desktop tool already, and there's no room for a
          second panel next to a narrow drawer. */}
      <div
        className={
          "fixed inset-y-0 left-[36rem] right-0 z-30 hidden flex-col gap-3 overflow-y-auto border-l border-black/[.1] bg-[var(--background)]/70 p-5 backdrop-blur-xl transition-transform duration-200 ease-out lg:flex dark:border-white/[.15] creamsicle:border-orange-300 " +
          (mounted ? "translate-x-0" : "-translate-x-full")
        }
      >
        {metricBuilder.mode !== "closed" ? (
          <MetricBuilderPanel
            variant="panel"
            initial={metricBuilder.mode === "edit" ? metricBuilder.metric : undefined}
            categoryOptions={categoryOptions}
            scope={{ accountIds, dateRange: config?.dataSource === "transactions" ? config.dateRange : undefined }}
            onSaved={(metric) => handleMetricSaved(metricBuilder.target, metric)}
            onCancel={() => setMetricBuilder({ mode: "closed" })}
          />
        ) : (
          <>
        <span className={labelClasses}>Preview</span>
        {showMultiColor && (
          <p className="-mt-2 text-[11px] text-zinc-500">Click a bar, slice, or row below to select it for Colors/Style.</p>
        )}
        <div className="h-96 shrink-0 overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.1]">
          <Widget
            widget={{ id: "__preview__", type, title: title.trim() || null, x: 0, y: 0, w: 0, h: 0, result: draftResult, config }}
            customMetricNames={Object.fromEntries(calculatedMetrics.map((m) => [m.id, m.name]))}
            onPointClick={showMultiColor ? togglePointSelected : undefined}
            selectedKeys={showMultiColor ? selectedPointKeys : undefined}
            onAxisLabelOffsetChange={showAxisLabels ? handleAxisLabelOffsetChange : undefined}
          />
        </div>

        {typeChosen && !isText && (
          <div className={showAxisLabels || showMetricDetailOption ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
          <div className="flex flex-col gap-2.5 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
            <span className={labelClasses}>Buttons</span>

            <span className="text-[11px] text-zinc-500">Date focus</span>

            {dateButtons.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {dateButtons.map((b, i) => (
                  <span
                    key={dateButtonKey(b)}
                    className="flex items-center gap-1 rounded-full border border-black/[.12] px-2 py-0.5 text-xs dark:border-white/[.15]"
                    title={b.kind === "custom" ? `${b.start} – ${b.end}` : undefined}
                  >
                    {dateButtonLabel(b)}
                    <button
                      type="button"
                      onClick={() => moveDateButton(i, -1)}
                      disabled={i === 0}
                      className="text-zinc-400 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
                      aria-label="Move earlier"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveDateButton(i, 1)}
                      disabled={i === dateButtons.length - 1}
                      className="text-zinc-400 hover:text-zinc-800 disabled:opacity-30 dark:hover:text-zinc-200"
                      aria-label="Move later"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDateButton(i)}
                      className="text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {dateButtons.length < 12 && (
              <div className="flex flex-wrap gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] text-zinc-500">
                    Fluid ({widgetScopeDays === Infinity ? "unbounded" : `≤${widgetScopeDays}d`})
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {DATE_BUTTON_PRESETS.filter(
                      (p) =>
                        !dateButtons.some((b) => b.kind === "preset" && b.preset === p) &&
                        dateButtonPresetDays(p) <= widgetScopeDays,
                    ).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDateButtons((prev) => [...prev, { kind: "preset", preset: p as DateButtonPreset }])}
                        className={pillClasses(false)}
                      >
                        + {dateButtonLabel({ kind: "preset", preset: p as DateButtonPreset })}
                      </button>
                    ))}
                    {addingCustomDaysButton ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={widgetScopeDays === Infinity ? 3650 : widgetScopeDays}
                          value={customButtonDays}
                          onChange={(e) => setCustomButtonDays(e.target.value)}
                          placeholder="e.g. 5"
                          autoFocus
                          className={selectClasses + " w-16"}
                        />
                        <button
                          type="button"
                          onClick={addCustomDaysButton}
                          disabled={
                            !customButtonDays.trim() ||
                            !Number.isInteger(Number(customButtonDays)) ||
                            Number(customButtonDays) < 0 ||
                            Number(customButtonDays) > widgetScopeDays
                          }
                          className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingCustomDaysButton(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAddingCustomDaysButton(true)} className={pillClasses(false)}>
                        + Custom
                      </button>
                    )}
                  </div>
                </div>

                <span aria-hidden className="w-px shrink-0 self-stretch bg-black/[.12] dark:bg-white/[.15]" />

                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[11px] text-zinc-500">Fixed</span>
                  {addingCustomButton ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <input
                        type="text"
                        value={customButtonLabel}
                        onChange={(e) => setCustomButtonLabel(e.target.value)}
                        placeholder="Label"
                        maxLength={20}
                        className={selectClasses + " w-20"}
                      />
                      <input
                        type="date"
                        value={customButtonStart}
                        onChange={(e) => setCustomButtonStart(e.target.value)}
                        className={selectClasses}
                      />
                      <span className="text-xs text-zinc-500">to</span>
                      <input
                        type="date"
                        value={customButtonEnd}
                        onChange={(e) => setCustomButtonEnd(e.target.value)}
                        className={selectClasses}
                      />
                      <button
                        type="button"
                        onClick={addCustomDateButton}
                        disabled={!customButtonLabel.trim() || !customButtonStart || !customButtonEnd}
                        className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingCustomButton(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingCustomButton(true)} className={pillClasses(false)}>
                      + Custom range…
                    </button>
                  )}
                </div>
              </div>
            )}

            {multiSeries && showMultiSeries && seriesList.length >= 2 && (
              <>
                <span className="text-[11px] text-zinc-500">Series</span>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showSeriesToggles} onChange={(e) => setShowSeriesToggles(e.target.checked)} />
                  <span className="text-sm">Let viewers turn individual {seriesNoun.toLowerCase()}s on/off on the tile</span>
                </label>
              </>
            )}
          </div>

          {showAxisLabels && (
          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
            <span className={labelClasses}>Text</span>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500">
                Axis titles (optional) — drag one directly in the preview above to reposition it
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={xAxisLabel}
                  onChange={(e) => setXAxisLabel(e.target.value)}
                  placeholder="X axis title"
                  className={selectClasses + " flex-1"}
                />
                <input
                  type="text"
                  value={yAxisLabel}
                  onChange={(e) => setYAxisLabel(e.target.value)}
                  placeholder="Y axis title"
                  className={selectClasses + " flex-1"}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Title size</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={8}
                    max={24}
                    value={axisFontSize}
                    onChange={(e) => setAxisFontSize(Number(e.target.value) || 11)}
                    className={selectClasses + " w-16"}
                  />
                  <span className="text-[11px] text-zinc-500">px</span>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <input type="checkbox" checked={showXTicks} onChange={(e) => setShowXTicks(e.target.checked)} />
                  X axis
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={6}
                    max={20}
                    value={xTickFontSize}
                    disabled={!showXTicks}
                    onChange={(e) => setXTickFontSize(Number(e.target.value) || 11)}
                    className={selectClasses + " w-16" + (showXTicks ? "" : " opacity-40")}
                  />
                  <span className="text-[11px] text-zinc-500">px</span>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <input type="checkbox" checked={showYTicks} onChange={(e) => setShowYTicks(e.target.checked)} />
                  Y axis
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={6}
                    max={20}
                    value={yTickFontSize}
                    disabled={!showYTicks}
                    onChange={(e) => setYTickFontSize(Number(e.target.value) || 12)}
                    className={selectClasses + " w-16" + (showYTicks ? "" : " opacity-40")}
                  />
                  <span className="text-[11px] text-zinc-500">px</span>
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Font</span>
                <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value as FontFamily)} className={selectClasses}>
                  {FONT_FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {FONT_FAMILY_LABELS[f]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">
              Shrink X/Y if bar/category names are squishing together, or uncheck one to remove it entirely.
            </p>

            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Y ticks</span>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={yTickCount}
                  onChange={(e) => setYTickCount(e.target.value)}
                  placeholder="Auto"
                  className={selectClasses + " w-16"}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Y min</span>
                <input
                  type="number"
                  value={yDomainMin}
                  onChange={(e) => setYDomainMin(e.target.value)}
                  placeholder="Auto"
                  className={selectClasses + " w-20"}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Y max</span>
                <input
                  type="number"
                  value={yDomainMax}
                  onChange={(e) => setYDomainMax(e.target.value)}
                  placeholder="Auto"
                  className={selectClasses + " w-20"}
                />
              </label>
            </div>
            <p className="text-[11px] text-zinc-500">
              How many $ labels the Y axis shows, and the range they cover — leave blank for recharts&rsquo; own
              nice-round-number default.
            </p>
          </div>
          )}

          {showMetricDetailOption && (
            <div className="flex flex-col gap-2.5 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
              <span className={labelClasses}>Detail</span>
              <p className="text-[11px] text-zinc-500">
                &ldquo;{selectedMetric?.name}&rdquo; is a periodic metric — pair the number with where it came from.
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMetricPeriodLabel}
                  onChange={(e) => setShowMetricPeriodLabel(e.target.checked)}
                />
                <span className="text-sm">
                  {metricHasExtreme ? "Show which period it came from" : "Show the period range it's averaged/compared over"}
                </span>
              </label>
              {metricHasExtreme && (
                <label className="flex items-center gap-2 pl-6">
                  <input
                    type="checkbox"
                    checked={showMetricTransactions}
                    onChange={(e) => setShowMetricTransactions(e.target.checked)}
                  />
                  <span className="text-sm">
                    {metricShowsLineItems ? "Also list the transactions from that period" : "Also show how many transactions that period"}
                  </span>
                </label>
              )}
            </div>
          )}
          </div>
        )}

        {typeChosen && (hasColorSection || hasStyleSection) && (
          <div className={hasColorSection && hasStyleSection ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
            {hasColorSection && (
              <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
                {showColor && (
                  <>
                    <span className={labelClasses}>Color</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {WIDGET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => (color === c ? clearColor() : pickColor(c))}
                          aria-label={`Color ${c}`}
                          className={
                            "h-6 w-6 rounded-full border-2 transition-transform " +
                            (color === c ? "scale-110 border-zinc-900 dark:border-zinc-50" : "border-transparent")
                          }
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      {/* Open picker — its swatch face always shows some color, so
                          it doubles as a 7th preset once you've used it once
                          (defaults to the first preset only for its own display,
                          not as a selection). */}
                      <input
                        type="color"
                        value={color ?? WIDGET_COLORS[0]}
                        onChange={(e) => pickColor(e.target.value)}
                        title="Custom color"
                        aria-label="Custom color"
                        className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                      />
                      <input
                        type="text"
                        value={hexDraft}
                        onChange={(e) => {
                          const v = e.target.value;
                          setHexDraft(v);
                          if (HEX_COLOR_PATTERN.test(v)) pickColor(v);
                        }}
                        onBlur={() => {
                          // Reverts a half-typed, never-valid hex back to whatever
                          // color is actually in effect, rather than leaving the
                          // field stuck showing something that was never applied.
                          if (!HEX_COLOR_PATTERN.test(hexDraft)) setHexDraft(color ?? "");
                        }}
                        placeholder="#RRGGBB"
                        maxLength={7}
                        className={selectClasses + " w-24 font-mono text-xs"}
                      />
                    </div>

                    {recentColors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-500">Recent</span>
                        {recentColors.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => pickColor(c)}
                            aria-label={`Color ${c}`}
                            className={
                              "h-5 w-5 rounded-full border-2 transition-transform " +
                              (color === c ? "scale-110 border-zinc-900 dark:border-zinc-50" : "border-transparent")
                            }
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}

                {showMultiColor && (
                  <>
                    <span className={labelClasses}>Colors</span>

                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["specific", "Specific Colors"],
                          ["gradient", "Gradients"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setColorMode((prev) => (prev === mode ? "none" : mode))}
                          className={
                            "rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors " +
                            (colorMode === mode
                              ? "border-zinc-900 bg-zinc-900/[.04] text-zinc-900 dark:border-zinc-50 dark:bg-zinc-50/[.08] dark:text-zinc-50 creamsicle:border-orange-600 creamsicle:bg-orange-50 creamsicle:text-orange-900"
                              : "border-black/[.1] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]")
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {colorMode === "specific" && (
                      <div className="flex flex-col gap-2">
                        <p className="text-[11px] text-zinc-500">
                          Click a bar, slice, or row in the Preview panel to select it, then pick a color to apply
                          to everything selected.
                        </p>
                        {selectedPointKeys.size > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(batchHexDraft) ? batchHexDraft : "#6366f1"}
                              onChange={(e) => {
                                setBatchHexDraft(e.target.value);
                                applyColorToSelected(e.target.value);
                              }}
                              title="Apply color to selected"
                              className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                            />
                            <input
                              type="text"
                              value={batchHexDraft}
                              onChange={(e) => {
                                setBatchHexDraft(e.target.value);
                                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyColorToSelected(e.target.value);
                              }}
                              placeholder="#RRGGBB"
                              maxLength={7}
                              className={selectClasses + " w-24 font-mono text-xs"}
                            />
                            <span className="text-[11px] text-zinc-500">{selectedPointKeys.size} selected</span>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">Nothing selected in the preview yet.</span>
                        )}

                        {Object.keys(pointColors).length > 0 && (
                          <button
                            type="button"
                            onClick={resetPointColors}
                            className="self-start text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                          >
                            Reset all to default colors
                          </button>
                        )}
                      </div>
                    )}

                    {colorMode === "gradient" && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          {GRADIENT_PRESETS.map((g) => (
                            <button
                              key={g.label}
                              type="button"
                              onClick={() => {
                                setGradientFrom(g.from);
                                setGradientTo(g.to);
                              }}
                              title={g.label}
                              className={
                                "h-7 w-16 rounded-md border-2 transition-transform " +
                                (gradientFrom === g.from && gradientTo === g.to
                                  ? "scale-105 border-zinc-900 dark:border-zinc-50"
                                  : "border-transparent")
                              }
                              style={{ background: `linear-gradient(to right, ${g.from}, ${g.to})` }}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-zinc-500">Custom:</span>
                          <input
                            type="color"
                            value={gradientFrom}
                            onChange={(e) => setGradientFrom(e.target.value)}
                            className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                          />
                          <span className="text-zinc-500">to</span>
                          <input
                            type="color"
                            value={gradientTo}
                            onChange={(e) => setGradientTo(e.target.value)}
                            className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                          />
                          <span
                            className="h-5 flex-1 rounded-md"
                            style={{ background: `linear-gradient(to right, ${gradientFrom}, ${gradientTo})` }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {hasStyleSection && (
              <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
                <span className={labelClasses}>Style</span>

                {showDataLabelsOption && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showDataLabels} onChange={(e) => setShowDataLabels(e.target.checked)} />
                    <span className="text-sm">Show values on each bar/point</span>
                  </label>
                )}

                {showGridLinesOption && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} />
                    <span className="text-sm">Grid lines (matching both axes&rsquo; values)</span>
                  </label>
                )}

                {showLineStyle && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-zinc-500">Line style</span>
                    <div className="flex flex-wrap gap-1.5">
                      {LINE_STYLES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setLineStyle(s)}
                          className={
                            "flex items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-xs font-medium transition-colors " +
                            (lineStyle === s
                              ? "border-zinc-900 bg-zinc-900/[.04] text-zinc-900 dark:border-zinc-50 dark:bg-zinc-50/[.08] dark:text-zinc-50 creamsicle:border-orange-600 creamsicle:bg-orange-50 creamsicle:text-orange-900"
                              : "border-black/[.1] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]")
                          }
                        >
                          <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden className="shrink-0">
                            <line x1="1" y1="5" x2="25" y2="5" stroke="currentColor" strokeWidth="2" strokeDasharray={LINE_STYLE_DASH[s]} />
                          </svg>
                          {LINE_STYLE_LABELS[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showFillPattern && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] text-zinc-500">Fill pattern</span>
                    <div className="flex flex-wrap gap-1.5">
                      {FILL_PATTERNS.map((p) => (
                        <FillPatternButton key={p} pattern={p} active={fillPattern === p} onClick={() => setFillPattern(p)} />
                      ))}
                    </div>

                    {showMultiColor &&
                      (selectedPointKeys.size > 0 ? (
                        <div className="flex flex-col gap-1.5 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                          <span className="text-[11px] text-zinc-500">
                            {selectedPointKeys.size} selected — apply a pattern to just these
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {FILL_PATTERNS.map((p) => (
                              <FillPatternButton key={p} pattern={p} active={false} onClick={() => applyPatternToSelected(p)} />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          Click a bar or slice in the Preview panel to give just that one a different pattern.
                        </span>
                      ))}

                    {Object.keys(fillPatternOverrides).length > 0 && (
                      <button
                        type="button"
                        onClick={resetFillPatternOverrides}
                        className="self-start text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200"
                      >
                        Reset all to default pattern
                      </button>
                    )}
                  </div>
                )}

                {type === "pie" && (
                  <div className="flex flex-col gap-1.5 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                    <span className="text-[11px] text-zinc-500">Slice labels</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["", "None"],
                          ["value", "$1,234"],
                          ["percent", "42%"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value || "none"}
                          type="button"
                          onClick={() => setPieLabelShow(value)}
                          className={pillClasses(pieLabelShow === value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {pieLabelShow && (
                      <div className="flex flex-wrap gap-1.5">
                        {(["outside", "inside"] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => setPieLabelPosition(pos)}
                            className={pillClasses(pieLabelPosition === pos)}
                          >
                            {pos === "outside" ? "Outside the chart" : "Inside the chart"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </>
  );
}
