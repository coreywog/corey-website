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
    transactionCategory: z.enum(["income", "spending", "transfer", "other"]).optional(),
  })
  .optional();

const axisLabelsSchema = z
  .object({
    x: z.string().max(60).optional(),
    y: z.string().max(60).optional(),
  })
  .optional();

export const WIDGET_TYPES = ["line", "bar", "pie", "stat", "table"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const METRICS = ["spendingTotal", "incomeTotal", "net", "transactionCount"] as const;
export type Metric = (typeof METRICS)[number];

export const GROUP_BYS = ["day", "month", "merchantCategory", "merchantSubcategory", "account", "merchant"] as const;
export type GroupBy = (typeof GROUP_BYS)[number];

export const WidgetConfigSchema = z.object({
  dataSource: z.literal("transactions"), // only value today — explicit for future data sources
  metric: z.enum(METRICS),
  groupBy: z.enum(GROUP_BYS).optional(), // omitted for stat tiles
  dateRange: dateRangeSchema,
  filters: filtersSchema,
  limit: z.number().int().positive().max(100).optional(),
  sort: z.enum(["totalDesc", "totalAsc", "labelAsc"]).optional(), // ignored when groupBy is day/month — see lib/dashboardQuery.ts
  compareToPrevious: z.boolean().optional(), // stat tiles only
  axisLabels: axisLabelsSchema, // line/bar only — read directly off config by components/dashboards/Widget.tsx
});

export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

export const WidgetLayoutSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
});
