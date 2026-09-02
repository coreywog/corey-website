import { prisma } from "@/lib/prisma";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { resolveDateRange, formatMonthLabel, formatCategoryLabel, normalizeMerchantName } from "@/lib/finance";
import { colorForCategory, colorForKey } from "@/components/finance/categoryColors";
import type { WidgetConfig, ChartWidgetConfig, WidgetType, GroupBy, Metric, SeriesEntryConfig } from "@/lib/dashboardConfig";

export type AggregatedPoint = { key: string; label: string; value: number; color: string };
// One raw transaction, not a bucket — scatter is the one chart type that
// isn't an aggregation at all (see computeWidgetData's early branch on
// type === "scatter"). x is always a date (recharts numeric axis); y is the
// transaction's contribution to whichever metric was picked.
export type ScatterPoint = { x: number; y: number; label: string; color: string };
// One x-axis bucket (e.g. a month) holding a value per stacked series (e.g.
// each merchant category) — recharts' own preferred "wide" shape for a
// stacked bar chart, one <Bar dataKey> per series. Keyed by series `key`,
// not `label`, so a category whose display label collides with `x`/`label`
// can't clobber them.
export type StackedPoint = { x: string; label: string; [seriesKey: string]: number | string };
export type StackedSeries = { key: string; label: string; color: string };
export type WidgetResult =
  | { kind: "series"; points: AggregatedPoint[] }
  // `label` is set only for a stat tile that also has a groupBy — the
  // ranked group the value came from (e.g. "Housing" for a top-category
  // stat) — see computeWidgetData's `type === "stat"` branch below.
  // `transactions` is set only for a periodic custom metric whose
  // periodAggregation is "max"/"min" — the actual line items behind the
  // period `label` points at (e.g. what was bought on your highest-
  // spending day), sorted largest first and capped to a handful. See
  // findPeriodicExtreme below.
  | { kind: "stat"; value: number; previousValue?: number; label?: string; transactions?: { merchant: string; amount: number }[] }
  | { kind: "scatter"; points: ScatterPoint[] }
  | { kind: "stacked"; points: StackedPoint[]; series: StackedSeries[] }
  // Manually-configured multiple series (config.series — the editor's Line
  // 1/Line 2 rows), as opposed to "stacked" above which is always an
  // automatic top-N-categories split. Same wide-row shape either way —
  // reusing StackedPoint/StackedSeries rather than a fourth near-identical
  // type — but kept as its own result kind since the two are triggered by,
  // and rendered from, entirely different config.
  | { kind: "multiSeries"; points: StackedPoint[]; series: StackedSeries[] }
  | { kind: "text"; text: string };

type DecryptedRow = {
  date: Date;
  amount: number;
  category: string;
  merchantCategory: string | null;
  merchantSubcategory: string | null;
  description: string | null; // only populated when groupBy === "merchant" — see fetchRows
  accountName: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * How much a row contributes toward a metric, or null if it doesn't count
 * at all (e.g. a transfer row under metric="spendingTotal"). Mirrors the
 * income/spending sign convention in computeMonthlyCashFlow (lib/finance.ts):
 * amount is negative for spending, positive for income; spendingTotal is
 * reported as a positive magnitude.
 */
function metricContribution(row: { amount: number; category: string }, metric: Metric): number | null {
  switch (metric) {
    case "spendingTotal":
      return row.category === "spending" ? -row.amount : null;
    case "incomeTotal":
      return row.category === "income" ? row.amount : null;
    case "net":
      // Unlike spendingTotal, net wants the raw signed amount for both —
      // amount is already negative for spending, positive for income, so
      // summing it directly gives income-minus-spending for free. Flipping
      // spending's sign here (as spendingTotal does) would add it instead
      // of subtracting it.
      return row.category === "income" || row.category === "spending" ? row.amount : null;
    case "transactionCount":
      return 1; // the query's own `where` already applied any category filter
  }
}

// Expanded this session from the original sum/average/count/min/max —
// median/percentile/stddev/variance/range all need the *full* list of
// matching values, not a running total, which is why the accumulator
// pattern below (emptyAccumulator/accumulate/finalizeAccumulator, one
// streaming {sum,count,min,max} struct) got replaced with array-collect-
// then-reduce (reduceValues). Transaction volumes here are thousands, not
// millions, so holding the array is cheap.
type Aggregation = "sum" | "average" | "count" | "min" | "max" | "median" | "percentile" | "stddev" | "variance" | "range";
type MetricPeriod = "day" | "week" | "month" | "year";
type PeriodAggregation = "max" | "min" | "average" | "growth";
type CustomMetric = {
  aggregation: Aggregation;
  // Only meaningful when aggregation === "percentile" (25/50/75/90/95/99).
  percentile: number | null;
  transactionCategory: string | null;
  // Narrows to specific merchant categories — independent of
  // transactionCategory (the transaction-level type vs. the richer,
  // arbitrary merchant taxonomy), same as a widget's own filters. Empty =
  // every category.
  merchantCategories: string[];
  // When set, this is a *periodic* metric — see computeCustomMetricValue.
  period: MetricPeriod | null;
  periodAggregation: PeriodAggregation | null;
};

/** A row's contribution under a saved CalculatedMetric, or null if this row
 * falls outside the metric's own scope (transaction type and/or merchant
 * categories) — absolute value, not signed: the category filter is what
 * narrows to spending-only/income-only/etc., so "average transaction size"
 * doesn't get thrown off by this app's negative-for-spending sign
 * convention. */
function customMetricRowValue(row: { amount: number; category: string; merchantCategory: string | null }, metric: CustomMetric): number | null {
  if (metric.transactionCategory && row.category !== metric.transactionCategory) return null;
  if (metric.merchantCategories.length && !metric.merchantCategories.includes(row.merchantCategory ?? "other")) return null;
  return Math.abs(row.amount);
}

/** Percentile via linear interpolation between the two nearest ranks (the
 * same method spreadsheets' PERCENTILE.INC use) — p=50 is the median. */
function percentileOf(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** Population variance (divides by N, not N-1) — this describes the actual
 * spread of the transactions that happened, not an estimate extrapolated
 * from a sample of some larger population. */
function varianceOf(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

/** Reduces a list of numbers — one per matching transaction, or (for a
 * periodic metric) one per period bucket — down to a single number.
 * Empty input is 0 across every case rather than letting NaN/Infinity leak
 * into a chart. */
function reduceValues(values: number[], aggregation: Aggregation, percentile: number | null): number {
  if (values.length === 0) return 0;
  switch (aggregation) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "count":
      return values.length;
    case "average":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "range":
      return Math.max(...values) - Math.min(...values);
    case "median":
      return percentileOf(values, 50);
    case "percentile":
      return percentileOf(values, percentile ?? 50);
    case "stddev":
      return Math.sqrt(varianceOf(values));
    case "variance":
      return varianceOf(values);
  }
}

/** The start of the day/week/month/year a date falls in, as a sortable
 * "YYYY-MM-DD" key — week starts Sunday. */
function periodKeyFor(date: Date, period: MetricPeriod): string {
  switch (period) {
    case "day":
      return date.toISOString().slice(0, 10);
    case "week": {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      return d.toISOString().slice(0, 10);
    }
    case "month":
      return `${date.toISOString().slice(0, 7)}-01`;
    case "year":
      return `${date.getUTCFullYear()}-01-01`;
  }
}

/**
 * A saved CalculatedMetric's value over a set of rows — every call site
 * below (stat tiles, groupBy buckets, multi-series cells, cumulative
 * offsets) funnels through this one function, so "what does this metric
 * mean" is defined exactly once. Non-periodic: reduces every matching
 * row's value straight to one number via `aggregation`. Periodic
 * (metric.period set): buckets rows by period first, reduces *within* each
 * bucket via the same `aggregation`, then reduces that list of per-period
 * numbers via `periodAggregation` — e.g. period="month" + aggregation="sum"
 * + periodAggregation="max" is "the highest-spending month"; "growth"
 * compares only the two most recent periods (latest vs. previous), not a
 * trend line across all of them.
 */
/** Buckets rows by period and reduces each bucket via the metric's own
 * `aggregation`, keeping each bucket's raw rows alongside its number — the
 * shared building block for both computeCustomMetricValue (which only
 * needs the final combined number) and findPeriodicExtreme below (which
 * needs to know exactly *which* period, and which transactions, produced
 * it — "Highest spending day: $342 on March 15," not just "$342"). Ordered
 * chronologically, oldest first, same as everywhere else a period sequence
 * gets built in this file. */
function bucketByPeriod(rows: DecryptedRow[], metric: CustomMetric & { period: MetricPeriod }): { key: string; value: number; rows: DecryptedRow[] }[] {
  const buckets = new Map<string, DecryptedRow[]>();
  for (const r of rows) {
    if (customMetricRowValue(r, metric) === null) continue;
    const key = periodKeyFor(r.date, metric.period);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  return [...buckets.keys()].sort().map((key) => {
    const bucketRows = buckets.get(key)!;
    const values = bucketRows.map((r) => customMetricRowValue(r, metric)).filter((v): v is number => v !== null);
    return { key, value: reduceValues(values, metric.aggregation, metric.percentile), rows: bucketRows };
  });
}

function computeCustomMetricValue(rows: DecryptedRow[], metric: CustomMetric): number {
  if (!metric.period) {
    const values: number[] = [];
    for (const r of rows) {
      const v = customMetricRowValue(r, metric);
      if (v !== null) values.push(v);
    }
    return reduceValues(values, metric.aggregation, metric.percentile);
  }
  const buckets = bucketByPeriod(rows, metric as CustomMetric & { period: MetricPeriod });
  const periodValues = buckets.map((b) => b.value);
  if (periodValues.length === 0) return 0;
  switch (metric.periodAggregation) {
    case "min":
      return Math.min(...periodValues);
    case "average":
      return periodValues.reduce((a, b) => a + b, 0) / periodValues.length;
    case "growth": {
      if (periodValues.length < 2) return 0;
      const prev = periodValues[periodValues.length - 2];
      const latest = periodValues[periodValues.length - 1];
      return prev === 0 ? 0 : ((latest - prev) / Math.abs(prev)) * 100;
    }
    case "max":
    default:
      return Math.max(...periodValues);
  }
}

/** The specific period a periodic max/min metric's value actually came
 * from, plus the raw transactions in it — only meaningful for
 * periodAggregation "max"/"min" (a single winning period to point to);
 * "average"/"growth" combine every period, so there's no one period to
 * highlight. Used by the stat-tile branch below to pair a number like
 * "$342" with "March 15, 2026" and what was actually bought that day. */
function findPeriodicExtreme(rows: DecryptedRow[], metric: CustomMetric): { key: string; value: number; rows: DecryptedRow[] } | null {
  if (!metric.period || (metric.periodAggregation !== "max" && metric.periodAggregation !== "min")) return null;
  const buckets = bucketByPeriod(rows, metric as CustomMetric & { period: MetricPeriod });
  if (buckets.length === 0) return null;
  return metric.periodAggregation === "min"
    ? buckets.reduce((a, b) => (b.value < a.value ? b : a))
    : buckets.reduce((a, b) => (b.value > a.value ? b : a));
}

/** "2026-03-15" -> "March 15, 2026", "2026-03-01" (a month bucket, always
 * stored as the 1st) -> "March 2026", etc. — periodKeyFor's own sortable
 * keys turned back into something worth reading in a chart. */
function formatPeriodLabel(key: string, period: MetricPeriod): string {
  const d = new Date(`${key}T00:00:00Z`);
  switch (period) {
    case "day":
      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    case "week":
      return `Week of ${d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`;
    case "month":
      return formatMonthLabel(key.slice(0, 7));
    case "year":
      return key.slice(0, 4);
  }
}

const PERIOD_UNIT: Record<MetricPeriod, string> = { day: "days", week: "weeks", month: "months", year: "years" };

/**
 * A periodic metric's stat-tile companion text — config.showMetricPeriodLabel
 * (the period/range) and config.showMetricTransactions (the line-item
 * breakdown, max/min only), both opt-in (see WidgetEditorPanel's "Detail"
 * section). max/min point at the one period that won, same as
 * findPeriodicExtreme above; average/growth have no single period to
 * highlight, so their caption describes the *span* instead — "92 days
 * (Jan 1 – Mar 31, 2026)" for average, "Feb 2026 → Mar 2026" for growth.
 * Returns {} (nothing to spread onto the stat result) whenever the metric
 * isn't periodic, both toggles are off, or there's no data to describe.
 */
function computePeriodicDetail(
  rows: DecryptedRow[],
  metric: CustomMetric,
  showLabel: boolean,
  showTransactions: boolean,
): { label?: string; transactions?: { merchant: string; amount: number }[] } {
  if (!metric.period || (!showLabel && !showTransactions)) return {};
  const isExtreme = metric.periodAggregation === "max" || metric.periodAggregation === "min";

  if (isExtreme) {
    const extreme = findPeriodicExtreme(rows, metric);
    if (!extreme) return {};
    return {
      ...(showLabel ? { label: formatPeriodLabel(extreme.key, metric.period) } : {}),
      ...(showTransactions
        ? {
            transactions: extreme.rows
              .map((r) => ({ merchant: r.description ? normalizeMerchantName(r.description) : "Unknown", amount: round2(Math.abs(r.amount)) }))
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 5),
          }
        : {}),
    };
  }

  // average/growth: no single winning period, so no transaction breakdown
  // makes sense regardless of showTransactions — only the range caption.
  if (!showLabel) return {};
  const buckets = bucketByPeriod(rows, metric as CustomMetric & { period: MetricPeriod });
  if (buckets.length === 0) return {};
  if (metric.periodAggregation === "growth") {
    if (buckets.length < 2) return {};
    const prev = buckets[buckets.length - 2];
    const latest = buckets[buckets.length - 1];
    return { label: `${formatPeriodLabel(prev.key, metric.period)} → ${formatPeriodLabel(latest.key, metric.period)}` };
  }
  // average (or any other future periodAggregation — falls back to the
  // same span description rather than showing nothing).
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const label =
    buckets.length === 1
      ? formatPeriodLabel(first.key, metric.period)
      : `${buckets.length} ${PERIOD_UNIT[metric.period]} (${formatPeriodLabel(first.key, metric.period)} – ${formatPeriodLabel(last.key, metric.period)})`;
  return { label };
}

function keyAndLabelFor(row: DecryptedRow, groupBy: GroupBy): { key: string; label: string } {
  switch (groupBy) {
    case "day": {
      const d = row.date.toISOString().slice(0, 10);
      return { key: d, label: d };
    }
    case "month": {
      const m = row.date.toISOString().slice(0, 7);
      return { key: m, label: formatMonthLabel(m) };
    }
    case "merchantCategory": {
      const c = row.merchantCategory ?? "other";
      return { key: c, label: formatCategoryLabel(c) };
    }
    case "merchantSubcategory": {
      const c = row.merchantSubcategory ?? "other";
      return { key: c, label: formatCategoryLabel(c) };
    }
    case "account":
      return { key: row.accountName, label: row.accountName };
    case "merchant": {
      const name = row.description ? normalizeMerchantName(row.description) : "Unknown";
      return { key: name, label: name };
    }
  }
}

function colorFor(key: string, groupBy: GroupBy): string {
  return groupBy === "merchantCategory" ? colorForCategory(key) : colorForKey(key);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function lerpColor(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/**
 * Applies the widget's own color choice on top of the default categorical
 * palette, for the multi-element chart types (bar/histogram/pie/table) —
 * the two modes the editor's "Specific Colors"/"Gradients" cards save as
 * mutually exclusive, so gradient wins if somehow both are set. A gradient
 * spans the points in whatever order they're already sorted in (largest to
 * smallest, or chronological for a histogram's bins); overrides are looked
 * up per-key so "Groceries" keeps its picked color regardless of sort
 * order or which other categories are present.
 */
function applyPointColors(points: AggregatedPoint[], config: ChartWidgetConfig): AggregatedPoint[] {
  if (config.gradient) {
    const { from, to } = config.gradient;
    const n = points.length;
    return points.map((p, i) => ({ ...p, color: n <= 1 ? from : lerpColor(from, to, i / (n - 1)) }));
  }
  if (config.colorOverrides && Object.keys(config.colorOverrides).length > 0) {
    return points.map((p) => (config.colorOverrides![p.key] ? { ...p, color: config.colorOverrides![p.key] } : p));
  }
  return points;
}

/** Builds the Prisma `where` shared by the main window and (for stat tiles) the comparison window. */
function buildWhere(config: ChartWidgetConfig, start: string, end: string) {
  return {
    date: { gte: new Date(start), lt: new Date(end) },
    ...(config.filters?.accountIds?.length
      ? // An explicit account selection is the user asking for exactly
        // these accounts — respect it even if one of them is normally
        // excluded (e.g. deliberately looking at PayPal on its own).
        { accountId: { in: config.filters.accountIds } }
      : // No explicit accounts picked: same default every other cash-flow
        // query in the app uses — leave out accounts like PayPal that
        // duplicate another account's charges, so aggregate totals aren't
        // doubled.
        { account: { excludeFromCashFlow: false } }),
    ...(config.filters?.merchantCategories?.length
      ? { merchantCategory: { in: config.filters.merchantCategories } }
      : {}),
    ...(config.filters?.merchantSubcategories?.length
      ? { merchantSubcategory: { in: config.filters.merchantSubcategories } }
      : {}),
    // The metric fixes category for spendingTotal/incomeTotal — an explicit
    // transactionCategory filter would just be redundant (or contradictory)
    // there, so it only applies for net/transactionCount. Skipped entirely
    // when a saved CalculatedMetric is in play: `metric` still holds
    // whatever it defaulted to (customMetricId overrides it, see
    // computeWidgetData), so forcing spending/income here from that stale
    // value would silently wrong-filter a custom "income" or "any" metric.
    // The metric's own transactionCategory is applied post-fetch instead —
    // see customMetricRowValue.
    ...(config.customMetricId
      ? {}
      : config.metric === "spendingTotal"
        ? { category: "spending" }
        : config.metric === "incomeTotal"
          ? { category: "income" }
          : config.filters?.transactionCategory
            ? { category: config.filters.transactionCategory }
            : {}),
  };
}

async function fetchRows(where: ReturnType<typeof buildWhere>, needsDescription: boolean): Promise<DecryptedRow[]> {
  const rows = await prisma.transaction.findMany({
    where,
    select: {
      date: true,
      amount: true,
      category: true,
      merchantCategory: true,
      merchantSubcategory: true,
      description: true,
      account: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    date: r.date,
    amount: decryptAmount(r.amount),
    category: r.category,
    merchantCategory: r.merchantCategory,
    merchantSubcategory: r.merchantSubcategory,
    // Only pay the decryption cost when the grouping actually needs it.
    description: needsDescription && r.description ? decryptText(r.description) : null,
    accountName: r.account.name,
  }));
}

/** No-op when `merchants` is unset — same shape either way, so every caller can run rows through this unconditionally. */
function filterByMerchant(rows: DecryptedRow[], merchants: string[] | undefined): DecryptedRow[] {
  if (!merchants?.length) return rows;
  const wanted = new Set(merchants);
  return rows.filter((r) => r.description && wanted.has(normalizeMerchantName(r.description)));
}

/**
 * Amount isn't a plain DB column either (encrypted at rest), so — same as
 * merchant — this filters in application code, after decryption, on
 * whatever the row actually contributes to the chosen metric (absolute
 * value, since the sign is about direction/category, not magnitude — "at
 * least $50" shouldn't need the user to think about which way the number's
 * signed).
 */
function filterByAmount(
  rows: DecryptedRow[],
  metric: Metric,
  amountMin: number | undefined,
  amountMax: number | undefined,
  customMetric: CustomMetric | null,
): DecryptedRow[] {
  if (amountMin === undefined && amountMax === undefined) return rows;
  return rows.filter((r) => {
    const contribution = customMetric ? customMetricRowValue(r, customMetric) : metricContribution(r, metric);
    if (contribution === null) return false;
    const magnitude = Math.abs(contribution);
    if (amountMin !== undefined && magnitude < amountMin) return false;
    if (amountMax !== undefined && magnitude > amountMax) return false;
    return true;
  });
}

/**
 * The running total a cumulative line/series starts from when its basis is
 * "lifetime" — every matching transaction strictly before the widget's own
 * window, summed the same way a normal bucket would be. "range" basis skips
 * this entirely and just starts at 0 (see the `cumulative`/`cumulativeBasis`
 * handling in computeMultiSeries and computeWidgetData below).
 * Re-runs buildWhere/fetchRows with an effectively unbounded start rather
 * than folding it into the main window's query — one extra query per
 * cumulative-lifetime series/widget, same tradeoff computeMultiSeries
 * already makes per series.
 */
/**
 * The actual earliest/latest transaction date matching a widget's filters
 * (accounts/categories/merchants/amount — everything about `config` except
 * its own `dateRange`, which this deliberately ignores in favor of
 * "allTime"), so the custom-range calendar picker (Widget.tsx's
 * DateRangeCalendarPicker) can gray out dates with nothing to show instead
 * of accepting any date and silently rendering an empty chart. Reuses the
 * same fetchRows/filterByMerchant/filterByAmount pipeline every other query
 * here goes through — rather than a DB-level MIN/MAX — since merchant and
 * amount filters only resolve after decryption (see buildWhere's own
 * comments). Returns null when nothing matches at all.
 */
/**
 * Just the id -> name of a set of saved CalculatedMetrics — for the
 * dashboard page to show a custom-metric widget's real name in its
 * auto-generated title (Widget.tsx) instead of the generic "Custom metric"
 * placeholder, without pulling in the full editor-context bundle (accounts,
 * category options, the decrypted merchant list) that only the widget
 * editor itself actually needs — see app/api/dashboards/[id]/editor-context.
 * A widget whose customMetricId no longer resolves to a real row (deleted
 * since) just isn't in the returned map; callers fall back to the generic
 * label the same way computeWidgetData already falls back for the value
 * itself.
 */
export async function getCalculatedMetricNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma.calculatedMetric.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export async function computeDateBounds(config: ChartWidgetConfig): Promise<{ min: string; max: string } | null> {
  const { start: allTimeStart, end: allTimeEnd } = resolveDateRange({ mode: "allTime" });
  const where = buildWhere(config, allTimeStart, allTimeEnd);
  const needsDescription = !!config.filters?.merchants?.length;
  let rows = await fetchRows(where, needsDescription);
  rows = filterByMerchant(rows, config.filters?.merchants);
  // customMetric is intentionally null here — bounds are just "is there any
  // data worth looking at that day," not a metric-accurate total, so a
  // saved CalculatedMetric's own amount semantics aren't worth resolving
  // just for this.
  rows = filterByAmount(rows, config.metric, config.filters?.amountMin, config.filters?.amountMax, null);
  if (rows.length === 0) return null;
  let min = rows[0].date;
  let max = rows[0].date;
  for (const r of rows) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  return { min: min.toISOString().slice(0, 10), max: max.toISOString().slice(0, 10) };
}

/** Shape a raw `calculatedMetric` DB row into the `CustomMetric` the query
 * engine actually works with — the one place both resolution call sites
 * (computeWidgetData, computeMultiSeries) build this from, so a new field
 * only needs adding here once. */
function toCustomMetric(m: {
  aggregation: string;
  percentile: number | null;
  transactionCategory: string | null;
  merchantCategories: string[];
  period: string | null;
  periodAggregation: string | null;
}): CustomMetric {
  return {
    aggregation: m.aggregation as Aggregation,
    percentile: m.percentile,
    transactionCategory: m.transactionCategory,
    merchantCategories: m.merchantCategories,
    period: m.period as MetricPeriod | null,
    periodAggregation: m.periodAggregation as PeriodAggregation | null,
  };
}

async function computeCumulativeOffset(config: ChartWidgetConfig, before: string, customMetric: CustomMetric | null): Promise<number> {
  // Earlier than any real transaction could be — stands in for "everything
  // up to `before`" without needing a separate unbounded query shape.
  const EPOCH = "1900-01-01";
  const where = buildWhere(config, EPOCH, before);
  const needsDescription = Boolean(config.filters?.merchants?.length);
  const rows = filterByAmount(
    filterByMerchant(await fetchRows(where, needsDescription), config.filters?.merchants),
    config.metric,
    config.filters?.amountMin,
    config.filters?.amountMax,
    customMetric,
  );
  let sum = 0;
  for (const r of rows) {
    const c = customMetric ? customMetricRowValue(r, customMetric) : metricContribution(r, config.metric);
    if (c !== null) sum += c;
  }
  return sum;
}

/**
 * A widget's manually-configured series (config.series — the editor's Line
 * 1/Line 2 rows) — each one is otherwise a full independent query sharing
 * only date range/accounts/groupBy with the widget as a whole, so this runs
 * `fetchRows` once per series rather than trying to fold N different
 * metric/category combinations into a single SQL query. Bounded (max 6
 * series, enforced by the schema) so this stays a small fixed multiplier on
 * query count, not an N+1 over user data.
 *
 * histogram is handled differently from the rest: instead of bucketing by
 * groupBy (day/month/category/...), every series' values get binned by
 * magnitude into the *same* bin edges (derived from the combined min/max
 * across all series), so the bars are actually comparable bin-for-bin.
 */
async function computeMultiSeries(config: ChartWidgetConfig, series: SeriesEntryConfig[], isHistogram: boolean): Promise<WidgetResult> {
  const { start, end } = resolveDateRange(config.dateRange);
  const merchantFilter = config.filters?.merchants;
  const needsDescription = config.groupBy === "merchant" || Boolean(merchantFilter?.length);

  const resolved = await Promise.all(
    series.map(async (entry) => {
      const seriesConfig: ChartWidgetConfig = {
        ...config,
        metric: entry.metric,
        customMetricId: entry.customMetricId,
        filters: {
          ...config.filters,
          ...(entry.merchantCategories?.length ? { merchantCategories: entry.merchantCategories } : {}),
        },
      };
      const where = buildWhere(seriesConfig, start, end);
      // Same reasoning as computeWidgetData's own customMetric lookup —
      // buildWhere above only needed entry.customMetricId's truthiness (a
      // plain string, no query), not the resolved row, so this can run
      // alongside fetchRows instead of blocking it. Each series already
      // runs in parallel with every other series (the outer Promise.all
      // this callback lives in) — this shaves a round-trip off whichever
      // series turns out to be the slowest one.
      const [customMetric, fetchedRows] = await Promise.all([
        entry.customMetricId
          ? prisma.calculatedMetric
              .findUnique({ where: { id: entry.customMetricId } })
              .then((m): CustomMetric | null => (m ? toCustomMetric(m) : null))
          : Promise.resolve<CustomMetric | null>(null),
        fetchRows(where, needsDescription),
      ]);
      const rows = filterByAmount(
        filterByMerchant(fetchedRows, merchantFilter),
        entry.metric,
        config.filters?.amountMin,
        config.filters?.amountMax,
        customMetric,
      );
      return { entry, rows, customMetric, seriesConfig };
    }),
  );

  const seriesInfo: StackedSeries[] = resolved.map(({ entry }, i) => ({
    key: entry.id,
    label: entry.label?.trim() || `Series ${i + 1}`,
    color: entry.color ?? colorForKey(entry.id),
  }));

  if (isHistogram) {
    const valuesBySeries = resolved.map(({ rows, entry, customMetric }) => {
      const values: number[] = [];
      for (const r of rows) {
        const c = customMetric ? customMetricRowValue(r, customMetric) : metricContribution(r, entry.metric);
        if (c !== null) values.push(Math.abs(c));
      }
      return values;
    });
    const combined = valuesBySeries.flat();
    if (combined.length === 0) return { kind: "multiSeries", points: [], series: [] };
    const min = Math.min(...combined);
    const max = Math.max(...combined);
    const BIN_COUNT = config.histogramBins ?? 12;
    const binSize = (max - min) / BIN_COUNT || 1;
    const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
    const points: StackedPoint[] = Array.from({ length: BIN_COUNT }, (_, i) => {
      const lo = min + i * binSize;
      const hi = lo + binSize;
      return { x: String(i), label: `${money(lo)}–${money(hi)}` };
    });
    resolved.forEach(({ entry }, i) => {
      for (const v of valuesBySeries[i]) {
        const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((v - min) / binSize)));
        points[idx][entry.id] = ((points[idx][entry.id] as number) ?? 0) + 1;
      }
    });
    // Bins a series never touched stay unset rather than 0 — recharts
    // treats a missing dataKey as no bar there, which is the right visual
    // (no zero-height placeholder for every series in every bin).
    return { kind: "multiSeries", points, series: seriesInfo };
  }

  if (!config.groupBy) return { kind: "multiSeries", points: [], series: seriesInfo };
  const groupBy = config.groupBy;
  const cellsByX = new Map<string, Map<string, number>>();
  const xLabels = new Map<string, string>();
  // Per entry, not one big pass over every row: a built-in metric keeps the
  // cheap running-sum it always used (metricContribution is sign-aware, and
  // "sum" is the only sensible reduction for it); a custom metric groups
  // its own rows by xKey first — retaining the full rows, not just a
  // number, since computeCustomMetricValue needs each row's actual date to
  // do its own period bucketing when the metric is periodic — then reduces
  // each xKey's bucket in one shot via the metric's own aggregation.
  for (const { entry, rows, customMetric } of resolved) {
    if (customMetric) {
      const rowsByX = new Map<string, DecryptedRow[]>();
      for (const r of rows) {
        if (customMetricRowValue(r, customMetric) === null) continue;
        const { key: xKey, label: xLabel } = keyAndLabelFor(r, groupBy);
        xLabels.set(xKey, xLabel);
        if (!rowsByX.has(xKey)) rowsByX.set(xKey, []);
        rowsByX.get(xKey)!.push(r);
      }
      for (const [xKey, xRows] of rowsByX) {
        if (!cellsByX.has(xKey)) cellsByX.set(xKey, new Map());
        cellsByX.get(xKey)!.set(entry.id, computeCustomMetricValue(xRows, customMetric));
      }
    } else {
      for (const r of rows) {
        const contribution = metricContribution(r, entry.metric);
        if (contribution === null) continue;
        const { key: xKey, label: xLabel } = keyAndLabelFor(r, groupBy);
        xLabels.set(xKey, xLabel);
        if (!cellsByX.has(xKey)) cellsByX.set(xKey, new Map());
        const cell = cellsByX.get(xKey)!;
        cell.set(entry.id, (cell.get(entry.id) ?? 0) + contribution);
      }
    }
  }
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  const xKeys = [...cellsByX.keys()].sort((a, b) => (isTimeSeries ? a.localeCompare(b) : 0));
  const points: StackedPoint[] = xKeys.map((xKey) => {
    const cell = cellsByX.get(xKey)!;
    const point: StackedPoint = { x: xLabels.get(xKey) ?? xKey, label: xLabels.get(xKey) ?? xKey };
    for (const [seriesId, value] of cell.entries()) point[seriesId] = round2(value);
    return point;
  });

  // Cumulative series (config.series[].cumulative) turn their column into a
  // running total, in the same chronological order `points` is already
  // sorted in — only meaningful for a day/month groupBy, same restriction
  // the editor enforces on the checkbox. A bucket the series had no rows in
  // stays part of the running total (defaults to 0 contribution) rather than
  // leaving a gap, unlike the raw per-bucket values above.
  if (isTimeSeries) {
    for (const { entry, seriesConfig, customMetric } of resolved) {
      if (!entry.cumulative) continue;
      let running = entry.cumulativeBasis === "lifetime" ? await computeCumulativeOffset(seriesConfig, start, customMetric) : 0;
      for (const point of points) {
        const bucketValue = typeof point[entry.id] === "number" ? (point[entry.id] as number) : 0;
        running += bucketValue;
        point[entry.id] = round2(running);
      }
    }
  }

  return { kind: "multiSeries", points, series: seriesInfo };
}

/**
 * Turns one widget's data-binding config into chart-ready data. Composes
 * lib/finance.ts's existing date/label helpers rather than duplicating
 * them — every lib/finance.ts aggregation function is fixed-purpose
 * (computeSpendingByCategory hardcodes "spending grouped by
 * merchantCategory"); this is the generic version, parameterized by
 * whatever the widget's config says.
 */
export async function computeWidgetData(config: WidgetConfig, type: WidgetType): Promise<WidgetResult> {
  // A text tile has no data behind it at all — nothing to query.
  if (config.dataSource === "text") {
    return { kind: "text", text: config.text };
  }

  // Multiple independently-configured series (the editor's Line 1/Line 2
  // rows) take over entirely for the chart types that can actually plot
  // more than one line/bar/histogram at once — checked before every branch
  // below, since none of the single-metric logic applies once this is set.
  const MULTI_SERIES_TYPES: WidgetType[] = ["line", "area", "bar", "stackedBar", "histogram"];
  if (config.series && config.series.length >= 2 && MULTI_SERIES_TYPES.includes(type)) {
    return computeMultiSeries(config, config.series, type === "histogram");
  }

  const { start, end } = resolveDateRange(config.dateRange);

  const where = buildWhere(config, start, end);
  // Merchant names aren't a plain DB column (see filtersSchema's own
  // comment in lib/dashboardConfig.ts) — decrypting descriptions is the
  // only way to filter or group by one, so either need turns it on.
  const merchantFilter = config.filters?.merchants;
  // The last clause is for a stat tile's periodic-max/min transaction
  // breakdown (findPeriodicExtreme, below) — whether *this* customMetricId
  // actually turns out to be periodic isn't knowable without a query, and
  // resolving it first would serialize a round-trip back in ahead of
  // fetchRows (see the comment on that Promise.all below, which exists
  // specifically to avoid that). Decrypting unconditionally for any
  // custom-metric stat tile is the cheaper tradeoff: CPU-bound and scoped
  // to this one widget's own row set, not an extra network round-trip on
  // every tab switch.
  const needsDescription = config.groupBy === "merchant" || Boolean(merchantFilter?.length) || (!config.groupBy && Boolean(config.customMetricId));

  // A saved CalculatedMetric (see prisma/schema.prisma), if this widget uses
  // one, takes over from the built-in `metric` for filterByAmount below —
  // one extra query, only when actually referenced, run in parallel with
  // fetchRows rather than awaited first: buildWhere above only needs to
  // know *whether* one is active (config.customMetricId, a plain string
  // already in hand — no query needed for that), not its resolved
  // aggregation/category, so there's nothing forcing this to go first. One
  // fewer round-trip serialized into every widget load, which matters most
  // here — this runs once per widget, and a tab switch computes every
  // widget on the new tab at once. Falls back to the built-in metric
  // (rather than erroring the whole widget) if the CalculatedMetric's ever
  // been deleted since this widget was configured — same defensive-read
  // philosophy as a bad WidgetConfig JSON blob.
  const [customMetric, fetchedRows] = await Promise.all([
    config.customMetricId
      ? prisma.calculatedMetric
          .findUnique({ where: { id: config.customMetricId } })
          .then((m): CustomMetric | null => (m ? toCustomMetric(m) : null))
      : Promise.resolve<CustomMetric | null>(null),
    fetchRows(where, needsDescription),
  ]);
  const rows = filterByAmount(
    filterByMerchant(fetchedRows, merchantFilter),
    config.metric,
    config.filters?.amountMin,
    config.filters?.amountMax,
    customMetric,
  );

  // Scatter is the one chart type that plots raw transactions instead of an
  // aggregated bucket per groupBy — one point per row, not one point per
  // group, so it doesn't go through the groupBy branch below at all.
  if (type === "scatter") {
    const points: ScatterPoint[] = [];
    for (const r of rows) {
      const value = metricContribution(r, config.metric);
      if (value === null) continue;
      points.push({
        x: r.date.getTime(),
        y: round2(value),
        label: formatCategoryLabel(r.merchantCategory ?? "other"),
        color: colorForCategory(r.merchantCategory ?? "other"),
      });
    }
    points.sort((a, b) => a.x - b.x);
    // Most recent N, not first N — a stale scatter of only the oldest
    // transactions in a long date range would be a strange default.
    const capped = config.limit && points.length > config.limit ? points.slice(-config.limit) : points;
    return { kind: "scatter", points: capped };
  }

  // A distribution of transaction sizes, not a bucket per groupBy — bins by
  // magnitude instead, so (like scatter) it skips the groupBy branch below.
  if (type === "histogram") {
    const values: number[] = [];
    for (const r of rows) {
      const c = metricContribution(r, config.metric);
      if (c !== null) values.push(Math.abs(c));
    }
    if (values.length === 0) return { kind: "series", points: [] };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const BIN_COUNT = config.histogramBins ?? 12;
    const binSize = (max - min) / BIN_COUNT || 1; // ||1 guards every value being identical (max === min)
    const counts = new Array<number>(BIN_COUNT).fill(0);
    for (const v of values) {
      const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((v - min) / binSize)));
      counts[idx]++;
    }
    const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
    const points: AggregatedPoint[] = counts.map((count, i) => {
      const lo = min + i * binSize;
      const hi = lo + binSize;
      return { key: String(i), label: `${money(lo)}–${money(hi)}`, value: count, color: colorForKey(String(i)) };
    });
    return { kind: "series", points: applyPointColors(points, config) };
  }

  // One series per (top-N) merchant category, stacked per groupBy bucket —
  // e.g. spending by category, stacked per month. Needs its own "wide" row
  // shape (one column per series), not the single `value` AggregatedPoint
  // shape everything else here produces.
  if (type === "stackedBar" && config.groupBy) {
    const xGroupBy = config.groupBy;
    const cellsByX = new Map<string, Map<string, number>>();
    const xLabels = new Map<string, string>();
    const categoryTotals = new Map<string, number>();
    for (const r of rows) {
      const contribution = metricContribution(r, config.metric);
      if (contribution === null) continue;
      const { key: xKey, label: xLabel } = keyAndLabelFor(r, xGroupBy);
      xLabels.set(xKey, xLabel);
      const catKey = r.merchantCategory ?? "other";
      if (!cellsByX.has(xKey)) cellsByX.set(xKey, new Map());
      const cell = cellsByX.get(xKey)!;
      cell.set(catKey, (cell.get(catKey) ?? 0) + contribution);
      categoryTotals.set(catKey, (categoryTotals.get(catKey) ?? 0) + contribution);
    }

    // Reuses `limit` for "how many categories to stack" here, same as it
    // means "top N bars" for a plain bar chart — folds the rest into
    // "Other" rather than letting the legend run to dozens of categories.
    const topN = config.limit ?? 6;
    const rankedCategories = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const keptCategories = rankedCategories.slice(0, topN);
    const hasOverflow = rankedCategories.length > topN;
    const OTHER_KEY = "__other__";
    const series: StackedSeries[] = keptCategories.map((k) => ({
      key: k,
      label: formatCategoryLabel(k),
      color: colorForCategory(k),
    }));
    if (hasOverflow) series.push({ key: OTHER_KEY, label: "Other", color: colorForKey("Other") });

    const isTimeSeries = xGroupBy === "day" || xGroupBy === "month";
    const xKeys = [...cellsByX.keys()].sort((a, b) => (isTimeSeries ? a.localeCompare(b) : 0));
    const points: StackedPoint[] = xKeys.map((xKey) => {
      const cell = cellsByX.get(xKey)!;
      const point: StackedPoint = { x: xLabels.get(xKey) ?? xKey, label: xLabels.get(xKey) ?? xKey };
      let otherSum = 0;
      for (const [catKey, value] of cell.entries()) {
        if (keptCategories.includes(catKey)) point[catKey] = round2(value);
        else otherSum += value;
      }
      if (hasOverflow) point[OTHER_KEY] = round2(otherSum);
      return point;
    });
    return { kind: "stacked", points, series };
  }

  function reduceRows(rowSet: DecryptedRow[], metric: Metric): number {
    if (customMetric) return computeCustomMetricValue(rowSet, customMetric);
    let total = 0;
    for (const r of rowSet) {
      const c = metricContribution(r, metric);
      if (c !== null) total += c;
    }
    return total;
  }

  if (!config.groupBy) {
    const value = round2(reduceRows(rows, config.metric));

    // For a periodic metric, pair the number with where it came from — see
    // computePeriodicDetail. Both parts are opt-in (WidgetEditorPanel's
    // "Detail" section), off by default, so an existing widget's stat
    // keeps rendering exactly as it always has until asked otherwise.
    const detail = customMetric
      ? computePeriodicDetail(rows, customMetric, Boolean(config.showMetricPeriodLabel), Boolean(config.showMetricTransactions))
      : {};

    if (!config.compareToPrevious) {
      return { kind: "stat", value, ...detail };
    }

    // Equal-length window immediately preceding the current one.
    const spanMs = new Date(end).getTime() - new Date(start).getTime();
    const prevEnd = start;
    const prevStart = new Date(new Date(start).getTime() - spanMs).toISOString().slice(0, 10);
    const prevWhere = buildWhere(config, prevStart, prevEnd);
    const prevRows = filterByAmount(
      filterByMerchant(await fetchRows(prevWhere, needsDescription), merchantFilter),
      config.metric,
      config.filters?.amountMin,
      config.filters?.amountMax,
      customMetric,
    );
    const previousValue = round2(reduceRows(prevRows, config.metric));
    return { kind: "stat", value, previousValue, ...detail };
  }

  const groupBy = config.groupBy;
  const totals = new Map<string, { label: string; value: number }>();
  if (customMetric) {
    // Group this metric's own matching rows by key first — retaining the
    // full rows, not a running number, since computeCustomMetricValue needs
    // each row's actual date to do its own period bucketing when the
    // metric is periodic — then reduce each key's bucket in one shot via
    // the metric's own aggregation. A key only appears at all if at least
    // one of its rows actually matched the metric's scope (transaction
    // type / merchant categories), same as the built-in-metric branch
    // below only ever adds a key once it's seen a real contribution.
    const rowsByKey = new Map<string, DecryptedRow[]>();
    const labelByKey = new Map<string, string>();
    for (const r of rows) {
      if (customMetricRowValue(r, customMetric) === null) continue;
      const { key, label } = keyAndLabelFor(r, groupBy);
      labelByKey.set(key, label);
      if (!rowsByKey.has(key)) rowsByKey.set(key, []);
      rowsByKey.get(key)!.push(r);
    }
    for (const [key, keyRows] of rowsByKey) {
      totals.set(key, { label: labelByKey.get(key)!, value: computeCustomMetricValue(keyRows, customMetric) });
    }
  } else {
    for (const r of rows) {
      const contribution = metricContribution(r, config.metric);
      if (contribution === null) continue;
      const { key, label } = keyAndLabelFor(r, groupBy);
      const existing = totals.get(key);
      if (existing) existing.value += contribution;
      else totals.set(key, { label, value: contribution });
    }
  }

  // "Top category"/"Bottom category" and friends — a stat tile can set a
  // groupBy too now, and just wants the #1 (or, sorted ascending, the
  // last-place) result from the exact same per-group aggregation bar/pie/
  // table already use, not a whole chart of its own. `sort` still controls
  // direction (totalAsc = bottom; anything else, including the totalDesc
  // default, = top). A day/month groupBy is allowed here unlike every
  // chart type below, which forces chronological order instead — a stat
  // tile isn't plotting a sequence, it's picking one row out of the
  // ranking ("the highest-spending day," not "spending over time").
  if (type === "stat") {
    const ranked = [...totals.entries()].map(([key, v]) => ({ key, ...v }));
    ranked.sort((a, b) => (config.sort === "totalAsc" ? a.value - b.value : b.value - a.value));
    const top = ranked[0];
    // keyAndLabelFor's own "day" label is a bare "2026-07-14" — fine as a
    // compact chart-axis tick (its usual job), too terse for a stat tile's
    // one-line caption, so it's reformatted here rather than changing what
    // every day-grouped chart's x-axis shows.
    const label = top ? (groupBy === "day" ? formatPeriodLabel(top.key, "day") : top.label) : undefined;
    return { kind: "stat", value: top ? round2(top.value) : 0, label };
  }

  let points: AggregatedPoint[] = [...totals.entries()].map(([key, { label, value }]) => ({
    key,
    label,
    value: round2(value),
    color: colorFor(key, groupBy),
  }));

  // A time series must stay chronological regardless of the widget's sort
  // setting — `sort` is really meant for bar/pie category rankings.
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  if (isTimeSeries) {
    points.sort((a, b) => a.key.localeCompare(b.key));

    // Running total instead of one value per bucket (config.cumulative) —
    // same behavior and "day/month groupBy only" restriction as
    // computeMultiSeries' per-series version above, just for a widget not
    // using config.series at all.
    if (config.cumulative) {
      let running = config.cumulativeBasis === "lifetime" ? await computeCumulativeOffset(config, start, customMetric) : 0;
      points = points.map((p) => {
        running += p.value;
        return { ...p, value: round2(running) };
      });
    }
  } else {
    switch (config.sort ?? "totalDesc") {
      case "totalAsc":
        points.sort((a, b) => a.value - b.value);
        break;
      case "labelAsc":
        points.sort((a, b) => a.label.localeCompare(b.label));
        break;
      default:
        points.sort((a, b) => b.value - a.value);
    }
  }

  if (!isTimeSeries && config.limit && points.length > config.limit) {
    const kept = points.slice(0, config.limit);
    const restTotal = points.slice(config.limit).reduce((sum, p) => sum + p.value, 0);
    kept.push({ key: "other", label: "Other", value: round2(restTotal), color: colorForKey("Other") });
    points = kept;
  }

  // Per-point color choices only make sense for chart types that render
  // each point as its own visual element (a bar, a slice, a table row) —
  // line/area render one continuous stroke, which uses the separate
  // `color` field instead (see Widget.tsx).
  const MULTI_ELEMENT_TYPES: WidgetType[] = ["bar", "histogram", "pie", "table"];
  if (MULTI_ELEMENT_TYPES.includes(type)) {
    points = applyPointColors(points, config);
  }

  return { kind: "series", points };
}
