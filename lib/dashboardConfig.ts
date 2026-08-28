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
  z.object({ mode: z.literal("specific"), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ mode: z.literal("allTime") }),
  z.object({
    mode: z.literal("custom"),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

// Quick-pick swatches shown alongside the open color picker/hex input in
// the editor — not the exhaustive set of allowed values (see `color` below,
// any hex works). Applied to the line stroke / stat number only; bar/pie/
// table keep their own per-category palette from lib/dashboardQuery.ts,
// where a single override wouldn't make sense.
export const WIDGET_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899"] as const;

const chartConfigSchema = z.object({
  dataSource: z.literal("transactions"), // only value today — explicit for future data sources
  metric: z.enum(METRICS),
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
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), // line/area/stat only, see above — any hex, not just the presets
  // Renders a small "1mo/3mo/6mo/1yr/All" row on the tile itself — on the
  // live dashboard, not just the editor — that overrides dateRange for
  // that viewer's session only (re-fetches via the same preview endpoint
  // the editor uses; never touches the saved config). See Widget.tsx.
  showDateButtons: z.boolean().optional(),
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
