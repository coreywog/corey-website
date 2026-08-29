"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
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
  type WidgetWithData,
} from "./Widget";
import type { CalculatedMetricOption } from "./DashboardTabs";
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
} from "@/lib/dashboardConfig";
import { WIDGET_COLORS, AXIS_X_POSITIONS, AXIS_Y_POSITIONS, DATE_BUTTON_PRESETS, GRADIENT_PRESETS, LINE_STYLES, FILL_PATTERNS } from "@/lib/dashboardConfig";

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
  { value: "merchantCategory", label: "Category" },
  { value: "merchantSubcategory", label: "Subcategory" },
  { value: "account", label: "Account" },
  { value: "merchant", label: "Merchant" },
];

const TRANSACTION_CATEGORY_OPTIONS = ["income", "spending", "transfer", "other"] as const;
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

type DateRangeMode = "relative" | "relativeDays" | "ytd" | "specific" | "allTime" | "custom";

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

const FILL_PATTERN_LABELS: Record<FillPattern, string> = {
  solid: "Solid",
  dots: "Dots",
  diagonalLinesRight: "Diagonal ↗",
  diagonalLinesLeft: "Diagonal ↘",
  crossHatch: "Cross-hatch",
  horizontalLines: "Horizontal",
  verticalLines: "Vertical",
};

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
  }
  const [metric, setMetric] = useState<Metric>(chartConfig?.metric ?? "spendingTotal");
  const [customMetricId, setCustomMetricId] = useState<string | undefined>(chartConfig?.customMetricId);
  // Local copy, not just the prop directly — saving a new one appends here
  // immediately so it's selectable right away, without waiting on a
  // router.refresh() to re-fetch the server-side list.
  const [calculatedMetrics, setCalculatedMetrics] = useState<CalculatedMetricOption[]>(initialCalculatedMetrics);
  const [creatingMetric, setCreatingMetric] = useState(false);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricAggregation, setNewMetricAggregation] = useState<"sum" | "average" | "count" | "min" | "max">("sum");
  const [newMetricCategory, setNewMetricCategory] = useState("");
  const [savingMetric, setSavingMetric] = useState(false);
  const [metricError, setMetricError] = useState<string | null>(null);

  async function handleCreateMetric() {
    const name = newMetricName.trim();
    if (!name) return;
    setSavingMetric(true);
    setMetricError(null);
    try {
      const res = await fetch("/api/dashboards/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          aggregation: newMetricAggregation,
          transactionCategory: newMetricCategory || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMetricError(body?.error ?? `Failed to save (${res.status}).`);
        return;
      }
      const body = await res.json();
      setCalculatedMetrics((prev) => [...prev, body.metric]);
      setCustomMetricId(body.metric.id);
      setCreatingMetric(false);
      setNewMetricName("");
      setNewMetricAggregation("sum");
      setNewMetricCategory("");
    } catch {
      setMetricError("Network error — try again.");
    } finally {
      setSavingMetric(false);
    }
  }

  const [groupBy, setGroupBy] = useState<GroupBy | "">(chartConfig?.groupBy ?? "merchantCategory");
  const [dateMode, setDateMode] = useState<DateRangeMode>(chartConfig?.dateRange.mode ?? "relative");
  const [relativeMonths, setRelativeMonths] = useState<1 | 3 | 6 | 12>(
    chartConfig?.dateRange.mode === "relative" ? chartConfig.dateRange.months : 6,
  );
  const [relativeDaysAgo, setRelativeDaysAgo] = useState<number>(
    chartConfig?.dateRange.mode === "relativeDays" ? chartConfig.dateRange.days : 1,
  );
  // Only shown once "Custom" is picked within the Fluid group — a free
  // number input for any N-days-back that isn't one of the preset pills.
  const [customDaysAgoDraft, setCustomDaysAgoDraft] = useState("");
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
  const [compareToPrevious, setCompareToPrevious] = useState(chartConfig?.compareToPrevious ?? false);
  const [xAxisLabel, setXAxisLabel] = useState(chartConfig?.axisLabels?.x ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(chartConfig?.axisLabels?.y ?? "");
  const [xAxisPosition, setXAxisPosition] = useState<(typeof AXIS_X_POSITIONS)[number]>(
    chartConfig?.axisLabels?.xPosition ?? "insideBottom",
  );
  const [yAxisPosition, setYAxisPosition] = useState<(typeof AXIS_Y_POSITIONS)[number]>(
    chartConfig?.axisLabels?.yPosition ?? "insideLeft",
  );
  const [axisFontSize, setAxisFontSize] = useState(chartConfig?.axisLabels?.fontSize ?? 11);
  const [dateButtons, setDateButtons] = useState<DateButtonConfig[]>(chartConfig?.dateButtons ?? []);
  const [addingCustomButton, setAddingCustomButton] = useState(false);
  const [customButtonLabel, setCustomButtonLabel] = useState("");
  const [customButtonStart, setCustomButtonStart] = useState("");
  const [customButtonEnd, setCustomButtonEnd] = useState("");
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
  // None of these three group by a picked field the normal way: scatter and
  // histogram plot/bin raw transactions, and calendar's grouping is always
  // "day" — forced below in the config useMemo, not offered as a choice.
  const needsGroupBy = !isText && !isScatter && !isHistogram && !isCalendar && type !== "stat";
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  const showLimit = (needsGroupBy && groupBy !== "" && !isTimeSeries && (type === "bar" || type === "pie")) || isStackedBar;
  const showAxisLabels = type === "line" || type === "area" || type === "bar" || isScatter || isHistogram;
  const showColor = type === "line" || type === "area" || type === "stat" || isCalendar;
  // The other coloring mode — per-point, for chart types with more than one
  // visual element at once. Mutually exclusive with showColor by type (a
  // widget is never both).
  const showMultiColor = type === "bar" || isHistogram || type === "pie" || type === "table";
  // Style section, below Color/Colors — line stroke dash pattern (line/area
  // only) and shape fill texture (anything with a solid fill to texture;
  // table/stat/calendar/scatter don't have one worth theming this way).
  const showLineStyle = type === "line" || type === "area";
  const showFillPattern = type === "bar" || isHistogram || type === "pie" || isStackedBar || type === "area";
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
  }, [dateMode, relativeMonths, relativeDaysAgo, customStart, customEnd, openEnded]);

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
            : dateMode === "specific"
              ? { mode: "specific", month: specificMonth }
              : dateMode === "custom"
                ? { mode: "custom", start: customStart, ...(openEnded ? {} : { end: customEnd }) }
                : { mode: "relative", months: relativeMonths };

    const parsedAmountMin = amountMin.trim() ? Number(amountMin) : undefined;
    const parsedAmountMax = amountMax.trim() ? Number(amountMax) : undefined;

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

    const axisLabels: ChartWidgetConfig["axisLabels"] =
      showAxisLabels && (xAxisLabel.trim() || yAxisLabel.trim())
        ? {
            ...(xAxisLabel.trim() ? { x: xAxisLabel.trim(), xPosition: xAxisPosition } : {}),
            ...(yAxisLabel.trim() ? { y: yAxisLabel.trim(), yPosition: yAxisPosition } : {}),
            fontSize: axisFontSize,
          }
        : undefined;

    return {
      dataSource: "transactions",
      metric,
      ...(customMetricId ? { customMetricId } : {}),
      ...(needsGroupBy ? { groupBy: groupBy as GroupBy } : isCalendar ? { groupBy: "day" as const } : {}),
      dateRange,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...((showLimit || isScatter) && limit ? { limit: Number(limit) } : {}),
      ...(type === "stat" ? { compareToPrevious } : {}),
      ...(axisLabels ? { axisLabels } : {}),
      ...(showColor && color ? { color } : {}),
      ...(showMultiColor && colorMode === "gradient" ? { gradient: { from: gradientFrom, to: gradientTo } } : {}),
      ...(showMultiColor && colorMode === "specific" && Object.keys(pointColors).length ? { colorOverrides: pointColors } : {}),
      ...(showLineStyle && lineStyle !== "solid" ? { lineStyle } : {}),
      ...(showFillPattern && fillPattern !== "solid" ? { fillPattern } : {}),
      ...(dateButtons.length ? { dateButtons } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showLimit/needsGroupBy/isCalendar/showAxisLabels/showColor/showMultiColor are all derived from type/metric/groupBy, already listed.
  }, [
    isText,
    text,
    type,
    metric,
    customMetricId,
    groupBy,
    dateMode,
    relativeMonths,
    relativeDaysAgo,
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
    compareToPrevious,
    xAxisLabel,
    yAxisLabel,
    xAxisPosition,
    yAxisPosition,
    axisFontSize,
    color,
    colorMode,
    pointColors,
    gradientFrom,
    gradientTo,
    lineStyle,
    fillPattern,
    dateButtons,
  ]);

  // Live preview — debounced, cancels a stale in-flight request rather than
  // letting it race a newer one and overwrite the preview with old data. A
  // text tile has no data behind it — it's a pure, synchronous derivation of
  // `text` (see the onDraftChange effect below), so it never touches this
  // effect or `preview` state at all.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `config` is rebuilt every render from the fields below; those are the real deps.
  }, [isText, text, type, metric, customMetricId, groupBy, dateMode, relativeMonths, relativeDaysAgo, specificMonth, customStart, customEnd, openEnded, accountIds, merchantCategories, merchantSubcategories, merchants, amountMin, amountMax, limit, compareToPrevious, color, colorMode, pointColors, gradientFrom, gradientTo, lineStyle, fillPattern, dateButtons]);

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

  // The live preview's own points double as the "columns to color" list in
  // the Specific Colors card below — always in sync with whatever the
  // current groupBy/filters actually produce, no separate fetch needed.
  const previewPoints = "kind" in draftResult && draftResult.kind === "series" ? draftResult.points : [];

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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{existing ? "Edit widget" : "Add widget"}</h2>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className={labelClasses}>Title (optional — auto-generated if left blank)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={selectClasses} />
        </label>

        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-4">
          {/* Left column: every field, each independently filterable — click
              one to open its picker. Hidden for a text tile, which has no
              data behind it at all. */}
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
                        <div className="flex flex-col gap-1">
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
                                }}
                                className={pillClasses(dateMode === "relativeDays" && relativeDaysAgo === d.days)}
                              >
                                {d.label}
                              </button>
                            ))}
                            <button type="button" onClick={() => setDateMode("ytd")} className={pillClasses(dateMode === "ytd")}>
                              Year to date
                            </button>
                            <button type="button" onClick={() => setDateMode("allTime")} className={pillClasses(dateMode === "allTime")}>
                              All time
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDateMode("relativeDays");
                                setCustomDaysAgoDraft(String(relativeDaysAgo));
                              }}
                              className={pillClasses(
                                dateMode === "relativeDays" && !RELATIVE_DAY_OPTIONS.some((d) => d.days === relativeDaysAgo),
                              )}
                            >
                              Custom…
                            </button>
                          </div>
                          {dateMode === "relativeDays" && !RELATIVE_DAY_OPTIONS.some((d) => d.days === relativeDaysAgo) && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={3650}
                                value={customDaysAgoDraft}
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
                        </div>

                        <div className="flex flex-col gap-1 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
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
                            <div className="flex items-center gap-2">
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
                              <div className="flex items-center gap-2">
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
              type-specific config, then filters/style below that. */}
          <div className={"flex flex-col gap-3" + (isText ? " col-span-2" : "")}>
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

                <label className="flex flex-col gap-1">
                  <span className={labelClasses}>Metric</span>
                  <select
                    value={customMetricId ? `custom:${customMetricId}` : metric}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__new__") {
                        setCreatingMetric(true);
                        return;
                      }
                      if (v.startsWith("custom:")) {
                        setCustomMetricId(v.slice("custom:".length));
                        return;
                      }
                      setCustomMetricId(undefined);
                      setMetric(v as Metric);
                    }}
                    className={selectClasses}
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
                </label>

                {creatingMetric && (
                  <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
                    <span className={labelClasses}>New calculated metric</span>
                    <p className="text-[11px] text-zinc-500">
                      Saved once, usable as the Metric on any widget from now on.
                    </p>
                    <input
                      type="text"
                      value={newMetricName}
                      onChange={(e) => setNewMetricName(e.target.value)}
                      placeholder="Name (e.g. Average grocery trip)"
                      maxLength={60}
                      className={selectClasses}
                    />
                    <div className="flex gap-1.5">
                      <select
                        value={newMetricAggregation}
                        onChange={(e) => setNewMetricAggregation(e.target.value as typeof newMetricAggregation)}
                        className={selectClasses}
                      >
                        <option value="sum">Sum</option>
                        <option value="average">Average</option>
                        <option value="count">Count</option>
                        <option value="min">Minimum</option>
                        <option value="max">Maximum</option>
                      </select>
                      <select
                        value={newMetricCategory}
                        onChange={(e) => setNewMetricCategory(e.target.value)}
                        className={selectClasses}
                      >
                        <option value="">Any transaction type</option>
                        {TRANSACTION_CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c} only
                          </option>
                        ))}
                      </select>
                    </div>
                    {metricError && <p className="text-sm text-red-600 dark:text-red-400">{metricError}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingMetric(false);
                          setMetricError(null);
                        }}
                        className="rounded-md border border-black/[.1] px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateMetric}
                        disabled={!newMetricName.trim() || savingMetric}
                        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                      >
                        {savingMetric ? "Saving…" : "Save metric"}
                      </button>
                    </div>
                  </div>
                )}

                {needsGroupBy && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClasses}>Group by</span>
                    <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className={selectClasses}>
                      <option value="" disabled>
                        Select…
                      </option>
                      {GROUP_BY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
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

                {type === "stat" && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={compareToPrevious} onChange={(e) => setCompareToPrevious(e.target.checked)} />
                    <span className="text-sm">Compare to prior period</span>
                  </label>
                )}

                {showAxisLabels && (
                  <div className="flex flex-col gap-2">
                    <span className={labelClasses}>Axis titles (optional)</span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={xAxisLabel}
                        onChange={(e) => setXAxisLabel(e.target.value)}
                        placeholder="X axis title"
                        className={selectClasses + " flex-1"}
                      />
                      <select
                        value={xAxisPosition}
                        onChange={(e) => setXAxisPosition(e.target.value as (typeof AXIS_X_POSITIONS)[number])}
                        className={selectClasses}
                        title="Where the X axis title sits"
                      >
                        <option value="insideBottom">Inside</option>
                        <option value="bottom">Below chart</option>
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={yAxisLabel}
                        onChange={(e) => setYAxisLabel(e.target.value)}
                        placeholder="Y axis title"
                        className={selectClasses + " flex-1"}
                      />
                      <select
                        value={yAxisPosition}
                        onChange={(e) => setYAxisPosition(e.target.value as (typeof AXIS_Y_POSITIONS)[number])}
                        className={selectClasses}
                        title="Where the Y axis title sits"
                      >
                        <option value="insideLeft">Inside</option>
                        <option value="left">Left of chart</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">Text size</span>
                      <input
                        type="number"
                        min={8}
                        max={24}
                        value={axisFontSize}
                        onChange={(e) => setAxisFontSize(Number(e.target.value) || 11)}
                        className={selectClasses + " w-16"}
                      />
                      <span className="text-[11px] text-zinc-500">px</span>
                    </label>
                  </div>
                )}

              </>
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
        <span className={labelClasses}>Preview</span>
        <div className="h-96 shrink-0 overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.1]">
          <Widget
            widget={{ id: "__preview__", type, title: title.trim() || null, x: 0, y: 0, w: 0, h: 0, result: draftResult, config }}
          />
        </div>

        {typeChosen && !isText && (
          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
            <span className={labelClasses}>Date focus buttons</span>
            <p className="text-[11px] text-zinc-500">Date focus buttons.</p>

            {dateButtons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dateButtons.map((b, i) => (
                  <span
                    key={dateButtonKey(b)}
                    className="flex items-center gap-1 rounded-full border border-black/[.12] px-2 py-1 text-xs dark:border-white/[.15]"
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
              <>
                <div className="flex flex-col gap-1 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                  <span className="text-[11px] text-zinc-500">
                    Fluid — only ranges that fit inside the Date filter above ({widgetScopeDays === Infinity ? "unbounded" : `≤${widgetScopeDays}d`}) are offered
                  </span>
                  <div className="flex flex-wrap gap-1.5">
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
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={widgetScopeDays === Infinity ? 3650 : widgetScopeDays}
                      value={customButtonDays}
                      onChange={(e) => setCustomButtonDays(e.target.value)}
                      placeholder="e.g. 5"
                      className={selectClasses + " w-20"}
                    />
                    <span className="text-xs text-zinc-500">days ago</span>
                    <button
                      type="button"
                      onClick={addCustomDaysButton}
                      disabled={
                        !customButtonDays.trim() ||
                        !Number.isInteger(Number(customButtonDays)) ||
                        Number(customButtonDays) < 0 ||
                        Number(customButtonDays) > widgetScopeDays
                      }
                      className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                  <span className="text-[11px] text-zinc-500">Fixed — an exact range, independent of the scope above</span>
                  {addingCustomButton ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="text"
                        value={customButtonLabel}
                        onChange={(e) => setCustomButtonLabel(e.target.value)}
                        placeholder="Label (e.g. July)"
                        maxLength={20}
                        className={selectClasses + " w-28"}
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
                        className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingCustomButton(false)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingCustomButton(true)} className={pillClasses(false)}>
                      + Custom range…
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {typeChosen && showColor && (
          <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
            <span className={labelClasses}>Color</span>
            <div className="flex items-center gap-1.5">
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
              <div className="flex items-center gap-1.5">
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
          </div>
        )}

        {typeChosen && showMultiColor && (
          <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
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
                  Click one or more below, then pick a color to apply to all of them at once.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {previewPoints.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePointSelected(p.key)}
                      className={
                        "flex items-center gap-1.5 rounded-full border-2 px-2 py-1 text-xs transition-colors " +
                        (selectedPointKeys.has(p.key)
                          ? "border-zinc-900 dark:border-zinc-50 creamsicle:border-orange-600"
                          : "border-transparent bg-black/[.04] hover:bg-black/[.07] dark:bg-white/[.06] dark:hover:bg-white/[.1]")
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: pointColors[p.key] ?? p.color }}
                      />
                      {p.label}
                    </button>
                  ))}
                  {previewPoints.length === 0 && (
                    <span className="text-xs text-zinc-500">Fill in the fields above to see columns to color.</span>
                  )}
                </div>

                {selectedPointKeys.size > 0 && (
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
                    <span className="text-[11px] text-zinc-500">
                      {selectedPointKeys.size} selected
                    </span>
                  </div>
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
                <div className="flex items-center gap-2 text-xs">
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
          </div>
        )}

        {typeChosen && (showLineStyle || showFillPattern) && (
          <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-[var(--background)]/60 p-3 dark:border-white/[.1]">
            <span className={labelClasses}>Style</span>

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
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFillPattern(p)}
                      className={
                        "flex items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 text-xs font-medium transition-colors " +
                        (fillPattern === p
                          ? "border-zinc-900 bg-zinc-900/[.04] text-zinc-900 dark:border-zinc-50 dark:bg-zinc-50/[.08] dark:text-zinc-50 creamsicle:border-orange-600 creamsicle:bg-orange-50 creamsicle:text-orange-900"
                          : "border-black/[.1] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]")
                      }
                    >
                      <svg width="20" height="16" viewBox="0 0 20 16" aria-hidden className="shrink-0 rounded-sm">
                        <FillPatternDefs pattern={p} colors={["#6366f1"]} />
                        <rect width="20" height="16" rx="2" fill={resolveFill(p, "#6366f1")} />
                      </svg>
                      {FILL_PATTERN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
