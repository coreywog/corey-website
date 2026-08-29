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
  | { kind: "stat"; value: number; previousValue?: number }
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

type Aggregation = "sum" | "average" | "count" | "min" | "max";
type CustomMetric = { aggregation: Aggregation; transactionCategory: string | null };

/** A row's contribution under a saved CalculatedMetric — absolute value,
 * not signed: the category filter is what narrows to spending-only/
 * income-only/etc., so "average transaction size" doesn't get thrown off
 * by this app's negative-for-spending sign convention. */
function customMetricRowValue(row: { amount: number; category: string }, metric: CustomMetric): number | null {
  if (metric.transactionCategory && row.category !== metric.transactionCategory) return null;
  return Math.abs(row.amount);
}

function emptyAccumulator() {
  return { sum: 0, count: 0, min: Infinity, max: -Infinity };
}

function accumulate(acc: ReturnType<typeof emptyAccumulator>, value: number) {
  acc.sum += value;
  acc.count += 1;
  if (value < acc.min) acc.min = value;
  if (value > acc.max) acc.max = value;
}

function finalizeAccumulator(acc: ReturnType<typeof emptyAccumulator>, aggregation: Aggregation): number {
  switch (aggregation) {
    case "sum":
      return acc.sum;
    case "count":
      return acc.count;
    case "average":
      return acc.count > 0 ? acc.sum / acc.count : 0;
    case "min":
      return acc.count > 0 ? acc.min : 0;
    case "max":
      return acc.count > 0 ? acc.max : 0;
  }
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
      : // No explicit accounts picked: same default every other page in
        // the app uses (see app/(site)/finance/page.tsx) — leave out
        // accounts like PayPal that duplicate another account's charges,
        // so aggregate totals aren't doubled.
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
      const customMetric: CustomMetric | null = entry.customMetricId
        ? await prisma.calculatedMetric
            .findUnique({ where: { id: entry.customMetricId } })
            .then((m) => (m ? { aggregation: m.aggregation as Aggregation, transactionCategory: m.transactionCategory } : null))
        : null;
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
      const rows = filterByAmount(
        filterByMerchant(await fetchRows(where, needsDescription), merchantFilter),
        entry.metric,
        config.filters?.amountMin,
        config.filters?.amountMax,
        customMetric,
      );
      return { entry, rows, customMetric };
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
    const BIN_COUNT = 12;
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
  for (const { entry, rows, customMetric } of resolved) {
    for (const r of rows) {
      const contribution = customMetric ? customMetricRowValue(r, customMetric) : metricContribution(r, entry.metric);
      if (contribution === null) continue;
      const { key: xKey, label: xLabel } = keyAndLabelFor(r, groupBy);
      xLabels.set(xKey, xLabel);
      if (!cellsByX.has(xKey)) cellsByX.set(xKey, new Map());
      const cell = cellsByX.get(xKey)!;
      cell.set(entry.id, (cell.get(entry.id) ?? 0) + contribution);
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

  // A saved CalculatedMetric (see prisma/schema.prisma), if this widget
  // uses one, takes over from the built-in `metric` everywhere below — one
  // extra query, only when actually referenced. Falls back to the built-in
  // metric (rather than erroring the whole widget) if it's ever been
  // deleted since this widget was configured — same defensive-read
  // philosophy as a bad WidgetConfig JSON blob. Loaded before buildWhere/
  // filterByAmount since both need to know whether it's active: forcing
  // category="spending" from a stale, ignored `metric` field, or measuring
  // "amount" filters against the wrong metric's contribution, would
  // silently wrong-filter a custom "income" or "any" metric otherwise.
  const customMetric: CustomMetric | null = config.customMetricId
    ? await prisma.calculatedMetric
        .findUnique({ where: { id: config.customMetricId } })
        .then((m) => (m ? { aggregation: m.aggregation as Aggregation, transactionCategory: m.transactionCategory } : null))
    : null;

  const where = buildWhere(config, start, end);
  // Merchant names aren't a plain DB column (see filtersSchema's own
  // comment in lib/dashboardConfig.ts) — decrypting descriptions is the
  // only way to filter or group by one, so either need turns it on.
  const merchantFilter = config.filters?.merchants;
  const needsDescription = config.groupBy === "merchant" || Boolean(merchantFilter?.length);
  const rows = filterByAmount(
    filterByMerchant(await fetchRows(where, needsDescription), merchantFilter),
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
    const BIN_COUNT = 12;
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

  if (!config.groupBy) {
    let value: number;
    if (customMetric) {
      const acc = emptyAccumulator();
      for (const r of rows) {
        const v = customMetricRowValue(r, customMetric);
        if (v !== null) accumulate(acc, v);
      }
      value = finalizeAccumulator(acc, customMetric.aggregation);
    } else {
      value = 0;
      for (const r of rows) {
        const c = metricContribution(r, config.metric);
        if (c !== null) value += c;
      }
    }
    value = round2(value);

    if (!config.compareToPrevious) {
      return { kind: "stat", value };
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
    let previousValue: number;
    if (customMetric) {
      const acc = emptyAccumulator();
      for (const r of prevRows) {
        const v = customMetricRowValue(r, customMetric);
        if (v !== null) accumulate(acc, v);
      }
      previousValue = finalizeAccumulator(acc, customMetric.aggregation);
    } else {
      previousValue = 0;
      for (const r of prevRows) {
        const c = metricContribution(r, config.metric);
        if (c !== null) previousValue += c;
      }
    }
    return { kind: "stat", value, previousValue: round2(previousValue) };
  }

  const groupBy = config.groupBy;
  const totals = new Map<string, { label: string; value: number }>();
  const customAccumulators = new Map<string, ReturnType<typeof emptyAccumulator>>();
  for (const r of rows) {
    const { key, label } = keyAndLabelFor(r, groupBy);
    if (customMetric) {
      const v = customMetricRowValue(r, customMetric);
      if (v === null) continue;
      if (!customAccumulators.has(key)) customAccumulators.set(key, emptyAccumulator());
      accumulate(customAccumulators.get(key)!, v);
      if (!totals.has(key)) totals.set(key, { label, value: 0 }); // value filled in below, once accumulation is complete
      continue;
    }
    const contribution = metricContribution(r, config.metric);
    if (contribution === null) continue;
    const existing = totals.get(key);
    if (existing) existing.value += contribution;
    else totals.set(key, { label, value: contribution });
  }

  // Fill in each group's real value now that every row's been accumulated —
  // can't finalize per-row above since average/min/max need the whole
  // group's data first, unlike a running sum.
  if (customMetric) {
    for (const [key, acc] of customAccumulators) {
      const existing = totals.get(key);
      if (existing) existing.value = finalizeAccumulator(acc, customMetric.aggregation);
    }
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
