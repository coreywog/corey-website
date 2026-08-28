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
export type WidgetResult =
  | { kind: "series"; points: AggregatedPoint[] }
  | { kind: "stat"; value: number; previousValue?: number }
  | { kind: "scatter"; points: ScatterPoint[] }
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
  const needsDescription = config.groupBy === "merchant";
  const rows = await fetchRows(where, needsDescription);

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
    const prevRows = await fetchRows(prevWhere, false);
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

  return { kind: "series", points };
}
