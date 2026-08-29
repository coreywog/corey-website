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

// Matches recharts' own CartesianLabelPosition values — not every value it
// supports, just the ones that make sense for "move the axis title".
export const AXIS_X_POSITIONS = ["insideBottom", "bottom"] as const;
export const AXIS_Y_POSITIONS = ["insideLeft", "left"] as const;
const axisLabelsSchema = z
  .object({
    x: z.string().max(60).optional(),
    y: z.string().max(60).optional(),
    xPosition: z.enum(AXIS_X_POSITIONS).optional(),
    yPosition: z.enum(AXIS_Y_POSITIONS).optional(),
    fontSize: z.number().int().min(8).max(24).optional(),
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
  // Renders a small quick-range button row on the tile itself — on the
  // live dashboard, not just the editor — that overrides dateRange for
  // that viewer's session only (re-fetches via the same preview endpoint
  // the editor uses; never touches the saved config). Order in the array
  // is display order. See Widget.tsx.
  dateButtons: z.array(dateButtonSchema).max(12).optional(),
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
