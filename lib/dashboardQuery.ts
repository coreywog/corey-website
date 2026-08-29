import { prisma } from "@/lib/prisma";
import { decryptAmount, decryptText } from "@/lib/crypto";
import { resolveDateRange, formatMonthLabel, formatCategoryLabel, normalizeMerchantName } from "@/lib/finance";
import { colorForCategory, colorForKey } from "@/components/finance/categoryColors";
import type { WidgetConfig, ChartWidgetConfig, WidgetType, GroupBy, Metric } from "@/lib/dashboardConfig";

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
    // there, so it only applies for net/transactionCount.
    ...(config.metric === "spendingTotal"
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
function filterByAmount(rows: DecryptedRow[], metric: Metric, amountMin?: number, amountMax?: number): DecryptedRow[] {
  if (amountMin === undefined && amountMax === undefined) return rows;
  return rows.filter((r) => {
    const contribution = metricContribution(r, metric);
    if (contribution === null) return false;
    const magnitude = Math.abs(contribution);
    if (amountMin !== undefined && magnitude < amountMin) return false;
    if (amountMax !== undefined && magnitude > amountMax) return false;
    return true;
  });
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

  const { start, end } = resolveDateRange(config.dateRange);
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
    let value = 0;
    for (const r of rows) {
      const c = metricContribution(r, config.metric);
      if (c !== null) value += c;
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
    );
    let previousValue = 0;
    for (const r of prevRows) {
      const c = metricContribution(r, config.metric);
      if (c !== null) previousValue += c;
    }
    return { kind: "stat", value, previousValue: round2(previousValue) };
  }

  const groupBy = config.groupBy;
  const totals = new Map<string, { label: string; value: number }>();
  for (const r of rows) {
    const contribution = metricContribution(r, config.metric);
    if (contribution === null) continue;
    const { key, label } = keyAndLabelFor(r, groupBy);
    const existing = totals.get(key);
    if (existing) existing.value += contribution;
    else totals.set(key, { label, value: contribution });
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
