import { z } from "zod";

/**
 * Validated shape of DashboardWidget.config (see prisma/schema.prisma —
 * stored as JSON precisely because this shape is meant to grow). Every
 * write goes through WidgetConfigSchema.parse (reject on failure); every
 * read should use .safeParse so one stale/bad config renders as a broken
 * tile, not a crashed page — see lib/dashboardQuery.ts.
 */

const dateRangeSchema = z.union([
  z.object({ mode: z.literal("relative"), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]) }),
  // Day-granularity version of the above ("Today"/"Yesterday"/...), or any
  // custom N-days-back the user types in — see lib/finance.ts's
  // DateRangeSelection for why this is its own mode rather than a UI-only
  // convenience.
  z.object({ mode: z.literal("relativeDays"), days: z.number().int().min(0).max(3650) }),
  z.object({ mode: z.literal("ytd") }),
  z.object({ mode: z.literal("specific"), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ mode: z.literal("allTime") }),
  // The N most recently *completed* calendar months, excluding whatever
  // month is currently in progress — see lib/finance.ts's
  // DateRangeSelection for why this is a distinct mode from "relative"
  // (which is a rolling N-months-back-by-day window instead).
  z.object({ mode: z.literal("monthsWindow"), months: z.number().int().min(1).max(24) }),
  // A single calendar month at a fixed offset from "now" — 0 is this
  // month, 1 is last month, 2 is two months back, etc. Distinct from
  // monthsWindow above (one merged range across several months for a
  // single chart): this is one specific month, meant for several widgets
  // each pinned to a different offset so they stay lined up and all shift
  // forward together as the calendar turns.
  z.object({ mode: z.literal("relativeMonth"), monthsAgo: z.number().int().min(0).max(36) }),
  z.object({
    mode: z.literal("custom"),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Omitted = open-ended, always through "now" — see lib/finance.ts's
    // resolveDateRange.
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
]);

const filtersSchema = z
  .object({
    accountIds: z.array(z.string().min(1)).optional(),
    merchantCategories: z.array(z.string().min(1)).optional(),
    // Only meaningful alongside merchantCategories — lets a widget narrow
    // to specific subcategories within whichever categories are selected,
    // rather than an entire category at once.
    merchantSubcategories: z.array(z.string().min(1)).optional(),
    // Narrows to specific merchants directly — e.g. just "Amazon", not the
    // whole "Shopping" category. Independent of merchantCategories/
    // merchantSubcategories, not nested under them: unlike subcategory
    // (which only narrows within an already-picked category), picking a
    // merchant doesn't require picking a category first. Merchant names
    // aren't a plain DB column (they're derived from the encrypted
    // description — see lib/finance.ts's normalizeMerchantName), so this
    // filters in application code after decryption, not in SQL — see
    // lib/dashboardQuery.ts.
    merchants: z.array(z.string().min(1)).optional(),
    transactionCategory: z.enum(["income", "spending", "transfer", "other"]).optional(),
    // Amount isn't a plain queryable DB column either (encrypted at rest —
    // see lib/crypto.ts), so like merchants this filters in application
    // code after decryption, not in SQL. Compared against the metric's own
    // signed contribution (see lib/dashboardQuery.ts's metricContribution),
    // not the raw stored amount, so "min 50" means "at least $50 of
    // whatever this widget is measuring," not a sign-confused raw value.
    amountMin: z.number().optional(),
    amountMax: z.number().optional(),
  })
  .optional();

// Not currently offered in the editor's UI (removed — "we don't need the
// option right now"), but left in the schema so an already-saved config
// that set one keeps rendering the same way, and so reviving the toggle
// later doesn't need a migration. formatValue() in Widget.tsx treats a
// missing value the same as "currency".
export const VALUE_FORMATS = ["currency", "number"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

// A pixel nudge from the default position (below the X axis, left of the Y
// axis) — the editor lets you drag the title directly in the live preview
// rather than picking from a fixed list of positions, so this needs to be
// continuous, not another enum.
const axisLabelOffsetSchema = z.object({ dx: z.number().min(-300).max(300), dy: z.number().min(-150).max(150) }).optional();

// A curated handful rather than a freeform font string — same reasoning as
// LINE_STYLES/FILL_PATTERNS: keeps the render surface small and the
// editor's picker exhaustive. All four resolve to something that renders
// everywhere with no extra loading: "sans"/"mono" reuse the site's own
// already-loaded Geist fonts (--font-sans/--font-mono, see app/layout.tsx),
// "serif" is the plain CSS generic family. Applies to every text element on
// the chart (axis titles, tick labels, legend), not just the axis titles.
export const FONT_FAMILIES = ["default", "sans", "serif", "mono"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

const axisLabelsSchema = z
  .object({
    x: z.string().max(60).optional(),
    y: z.string().max(60).optional(),
    xOffset: axisLabelOffsetSchema,
    yOffset: axisLabelOffsetSchema,
    fontSize: z.number().int().min(8).max(24).optional(), // the axis *title* text, not the tick labels
    // Tick label text — separately adjustable from the title above, since
    // this is the actual fix for bar/category names overlapping each other
    // once a tile gets resized narrow: shrinking just the ticks (not the
    // title) buys back the room they need.
    xTickFontSize: z.number().int().min(6).max(20).optional(),
    yTickFontSize: z.number().int().min(6).max(20).optional(),
    valueFormat: z.enum(VALUE_FORMATS).optional(),
    fontFamily: z.enum(FONT_FAMILIES).optional(),
    // Whether the tick labels (category/day names on X, dollar amounts on
    // Y) render at all — omitted/true is shown, same as always; false hides
    // them entirely for a cleaner/sparkline-style tile. Independent of
    // xTickFontSize/yTickFontSize above (shrinking vs. removing outright are
    // two different asks).
    showXTicks: z.boolean().optional(),
    showYTicks: z.boolean().optional(),
  })
  .optional();

export const WIDGET_TYPES = [
  "line",
  "area",
  "bar",
  "stackedBar",
  "pie",
  "stat",
  "table",
  "scatter",
  "histogram",
  "calendar",
  "text",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const METRICS = ["spendingTotal", "incomeTotal", "net", "transactionCount"] as const;
export type Metric = (typeof METRICS)[number];

// Short form for an auto-generated widget title (Widget.tsx) — the
// editor's own METRIC_OPTIONS carries the fuller "Net (income − spending)"
// wording, too long to sit next to a date range in a compact tile title.
export const METRIC_LABELS: Record<Metric, string> = {
  spendingTotal: "Spending",
  incomeTotal: "Income",
  net: "Net",
  transactionCount: "Transactions",
};

export const GROUP_BYS = ["day", "month", "merchantCategory", "merchantSubcategory", "account", "merchant"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

// The tile-level quick-range row (config.dateButtons below) — presets are
// computed client-side (Widget.tsx) into a concrete dateRange at click
// time, so no new dateRange mode is needed for "ytd" etc. A custom button
// carries its own fixed start/end, entirely independent of the widget's
// saved dateRange — e.g. a widget filtered to the last 6 months can still
// offer a "July" shortcut button outside that window.
export const DATE_BUTTON_PRESETS = ["1m", "3m", "6m", "1y", "ytd", "all"] as const;
export type DateButtonPreset = (typeof DATE_BUTTON_PRESETS)[number];
const dateButtonSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), preset: z.enum(DATE_BUTTON_PRESETS) }),
  // A fluid "N days ago" button the user typed a custom N for — same idea
  // as the main Date filter's relativeDays mode, just scoped to this one
  // button rather than the whole widget. Recomputed from today at click
  // time (see Widget.tsx's dateButtonRange), never a frozen date.
  z.object({ kind: z.literal("relativeDays"), days: z.number().int().min(0).max(3650) }),
  z.object({
    kind: z.literal("custom"),
    label: z.string().trim().min(1).max(20),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
]);
export type DateButtonConfig = z.infer<typeof dateButtonSchema>;

// Quick-pick swatches shown alongside the open color picker/hex input in
// the editor — not the exhaustive set of allowed values (see `color` below,
// any hex works). Applied to the line stroke / stat number only — bar/pie/
// histogram/table have their own per-point coloring instead, since one
// color can't represent several bars/slices (see colorOverrides/gradient
// below).
export const WIDGET_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

// Starter gradients for the editor's "Gradients" card — the first is the
// app's own accent-to-brand pairing, used as the auto-selected default when
// switching into gradient mode; the rest are generic enough to suit any
// theme. Any two colors work via the custom start/end picker too — this
// list is just what's offered before you touch it.
export const GRADIENT_PRESETS = [
  { label: "Brand", from: "#6366f1", to: "#ec4899" },
  { label: "Cool → warm", from: "#0ea5e9", to: "#f59e0b" },
  { label: "Light → dark", from: "#e0e7ff", to: "#312e81" },
  { label: "Green scale", from: "#d1fae5", to: "#065f46" },
] as const;

// Line/area stroke — a strokeDasharray preset, not a raw string, so a saved
// config can't carry an arbitrary dasharray value (keeps the render surface
// small and the editor's picker exhaustive). The actual dash values live
// next to the rendering code (components/dashboards/Widget.tsx), not here —
// this file only validates which named styles are allowed.
export const LINE_STYLES = ["solid", "dashed", "dotted", "dashDot", "longDash"] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

// Bar/pie/histogram/area-fill shape fill — solid color or a repeating SVG
// pattern (rendered via <defs> in Widget.tsx, one pattern per distinct
// point color so multi-category charts still read by color, not just
// texture).
export const FILL_PATTERNS = ["solid", "dots", "diagonalLinesRight", "diagonalLinesLeft", "crossHatch", "horizontalLines", "verticalLines"] as const;
export type FillPattern = (typeof FILL_PATTERNS)[number];

// One independently-configured line/bar/histogram within a multi-series
// widget — the editor's collapsible "Line 1"/"Line 2" rows. Deliberately
// narrow: just metric + category, sharing everything else (date range,
// accounts, groupBy) with the widget as a whole — see lib/dashboardQuery.ts's
// computeMultiSeries. `id` is a stable key independent of array order/label,
// used both as the React list key and the recharts dataKey for this series'
// column, so renaming a line or reordering the list can't silently merge two
// series' data together.
const seriesEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().max(40).optional(), // shown in the legend; auto "Line N" if omitted
  metric: z.enum(METRICS),
  customMetricId: z.string().optional(),
  merchantCategories: z.array(z.string().min(1)).optional(),
  color: z.string().regex(HEX).optional(),
});
export type SeriesEntryConfig = z.infer<typeof seriesEntrySchema>;

const chartConfigSchema = z.object({
  dataSource: z.literal("transactions"), // only value today — explicit for future data sources
  metric: z.enum(METRICS),
  // A saved CalculatedMetric (see prisma/schema.prisma) takes over from
  // `metric` entirely when set — `metric` stays required/populated anyway
  // so a config always validates and has a sane fallback if the referenced
  // CalculatedMetric is ever deleted (see lib/dashboardQuery.ts).
  customMetricId: z.string().optional(),
  groupBy: z.enum(GROUP_BYS).optional(), // omitted for stat tiles
  dateRange: dateRangeSchema,
  filters: filtersSchema,
  // 1000 to give scatter (one point per transaction) room — bar/pie's "Top
  // N" only ever needs a handful in practice, but nothing enforces that
  // distinction here; the editor's own input just caps lower for those.
  limit: z.number().int().positive().max(1000).optional(),
  sort: z.enum(["totalDesc", "totalAsc", "labelAsc"]).optional(), // ignored when groupBy is day/month — see lib/dashboardQuery.ts
  compareToPrevious: z.boolean().optional(), // stat tiles only
  axisLabels: axisLabelsSchema, // line/area/bar/scatter/histogram only — read directly off config by components/dashboards/Widget.tsx
  color: z.string().regex(HEX).optional(), // line/area/stat only, see above — any hex, not just the presets
  // Per-point color choices for bar/histogram/pie/table (see
  // lib/dashboardQuery.ts's applyPointColors) — the editor's "Specific
  // Colors" and "Gradients" cards, mutually exclusive in the UI (gradient
  // wins if both are somehow set). colorOverrides is keyed by the point's
  // own `key` (a category name, a merchant, a histogram bin index, ...),
  // so a pick survives re-sorting or a changed Top-N limit; anything
  // without an entry keeps the default categorical palette.
  colorOverrides: z.record(z.string(), z.string().regex(HEX)).optional(),
  gradient: z.object({ from: z.string().regex(HEX), to: z.string().regex(HEX) }).optional(),
  // Style, below Color in the editor — line/area stroke dash pattern, and
  // bar/histogram/pie/area-fill texture. Independent of color: a config can
  // set either, both, or neither.
  lineStyle: z.enum(LINE_STYLES).optional(),
  fillPattern: z.enum(FILL_PATTERNS).optional(),
  // Per-point pattern overrides — same shape and same selection mechanism
  // as colorOverrides above (click points in the editor's live preview,
  // then pick a pattern), keyed by the point's own `key` so it survives
  // re-sorting or a changed Top-N limit just like colorOverrides does.
  fillPatternOverrides: z.record(z.string(), z.enum(FILL_PATTERNS)).optional(),
  // Renders a small quick-range button row on the tile itself — on the
  // live dashboard, not just the editor — that overrides dateRange for
  // that viewer's session only (re-fetches via the same preview endpoint
  // the editor uses; never touches the saved config). Order in the array
  // is display order. See Widget.tsx.
  dateButtons: z.array(dateButtonSchema).max(12).optional(),
  // Multiple independently-configured lines/bars on one chart — line/area/
  // bar/stackedBar/histogram only (see showMultiSeries in the editor).
  // When set (2+ entries), this takes over rendering entirely; the
  // top-level metric/customMetricId above stay populated regardless, as
  // the fallback if series is ever cleared back to a single measure.
  series: z.array(seriesEntrySchema).min(2).max(6).optional(),
  // Pie-only: where each slice's number is drawn. Independent of color/
  // style above.
  pieLabels: z
    .object({
      show: z.enum(["value", "percent"]).optional(), // omitted = no labels at all
      position: z.enum(["inside", "outside"]).optional(),
    })
    .optional(),
  // Prints the actual value on/above each bar, and at each point on a line
  // or area — line/area/bar/stackedBar/histogram only. Off by default: on a
  // line with many points (e.g. daily data over months) this gets crowded
  // fast, so it's an explicit opt-in rather than always-on.
  showDataLabels: z.boolean().optional(),
  // Reference lines behind the chart, aligned to both axes' tick values —
  // omitted/true = shown (the default, so existing widgets pick up the
  // fuller grid automatically), false = no grid at all.
  showGridLines: z.boolean().optional(),
});

// A free-text tile — no data behind it at all, just whatever the user
// typed. Kept as a wholly separate shape (not a chartConfigSchema with
// every aggregation field made optional) since none of those fields mean
// anything for it.
const textConfigSchema = z.object({
  dataSource: z.literal("text"),
  text: z.string().min(1).max(2000),
});

export const WidgetConfigSchema = z.union([chartConfigSchema, textConfigSchema]);
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;
// The aggregation-query half of WidgetConfig, narrowed on dataSource — for
// functions (lib/dashboardQuery.ts's buildWhere) that only ever run once a
// text config has already been ruled out and need the real fields back.
export type ChartWidgetConfig = Extract<WidgetConfig, { dataSource: "transactions" }>;

export const WidgetLayoutSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
