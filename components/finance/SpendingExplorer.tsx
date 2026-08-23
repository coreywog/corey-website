"use client";

import { useMemo, useState } from "react";
import {
  computeSpendingHierarchy,
  computeSpendingByMerchant,
  computeSpendingByWeekday,
  computeRecurringSubscriptions,
  formatCategoryLabel,
  monthsAgo,
} from "@/lib/finance";
import { colorForCategory, colorForKey } from "./categoryColors";
import { SpendingList } from "./SpendingList";
import { SpendingBarChart, type BarDatum } from "./SpendingBarChart";
import { SpendingPieChart } from "./SpendingPieChart";
import { WeekdaySpendingChart } from "./WeekdaySpendingChart";
import { RecurringSubscriptions } from "./RecurringSubscriptions";

export type ExplorerTransaction = {
  date: string; // YYYY-MM-DD
  amount: number; // decrypted, negative = spend
  category: string; // income/spending/other/transfer
  merchantCategory: string | null;
  merchantSubcategory: string | null;
  description: string | null; // decrypted
};

const RANGES = [
  { key: "1m" as const, label: "1 month", months: 1 },
  { key: "3m" as const, label: "3 months", months: 3 },
  { key: "6m" as const, label: "6 months", months: 6 },
];

/**
 * Full category → subcategory → merchant drill-down. Row one is category
 * totals (list + isolate-bar + highlight-bar + pie); clicking a category
 * reveals row two, the same 4-panel pattern one level deeper (subcategory
 * totals, or — after a further click — the specific merchants inside that
 * subcategory), plus an average-spending-by-weekday chart scoped to
 * whatever's currently selected.
 */
export function SpendingExplorer({ transactions }: { transactions: ExplorerTransaction[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("6m");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [highlightedMerchant, setHighlightedMerchant] = useState<string | null>(null);

  const rangeMonths = RANGES.find((r) => r.key === range)!.months;
  const startStr = useMemo(() => monthsAgo(rangeMonths).toISOString().slice(0, 10), [rangeMonths]);
  const endStr = useMemo(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), []);

  const filtered = useMemo(
    () => transactions.filter((t) => t.date >= startStr && t.date < endStr),
    [transactions, startStr, endStr],
  );

  const hierarchy = useMemo(() => computeSpendingHierarchy(filtered), [filtered]);

  const categoryData: BarDatum[] = useMemo(
    () =>
      hierarchy.map((h) => ({
        key: h.category,
        label: formatCategoryLabel(h.category),
        total: h.total,
        color: colorForCategory(h.category),
      })),
    [hierarchy],
  );

  // A selection that no longer exists in the current range gets dropped
  // rather than silently showing stale drill-down data.
  const selectedEntry = hierarchy.find((h) => h.category === selectedCategory) ?? null;
  const effectiveCategory = selectedEntry ? selectedCategory : null;
  const effectiveSubcategory =
    effectiveCategory && selectedEntry?.subcategories.some((s) => s.subcategory === selectedSubcategory)
      ? selectedSubcategory
      : null;

  const drillData: BarDatum[] = useMemo(() => {
    if (!selectedEntry) return [];
    if (!effectiveSubcategory) {
      return selectedEntry.subcategories.map((s) => ({
        key: s.subcategory,
        label: formatCategoryLabel(s.subcategory),
        total: s.total,
        color: colorForKey(s.subcategory),
      }));
    }
    const merchantTxns = filtered.filter(
      (t) => t.merchantCategory === effectiveCategory && t.merchantSubcategory === effectiveSubcategory,
    );
    return computeSpendingByMerchant(merchantTxns).map((m) => ({
      key: m.merchant,
      label: m.merchant,
      total: m.total,
      color: colorForKey(m.merchant),
    }));
  }, [selectedEntry, effectiveCategory, effectiveSubcategory, filtered]);

  const weekdayScope = useMemo(() => {
    if (!effectiveCategory) return filtered;
    return filtered.filter((t) => {
      if (t.merchantCategory !== effectiveCategory) return false;
      if (effectiveSubcategory && t.merchantSubcategory !== effectiveSubcategory) return false;
      return true;
    });
  }, [filtered, effectiveCategory, effectiveSubcategory]);

  const weekdayData = useMemo(
    () => computeSpendingByWeekday(weekdayScope, startStr, endStr),
    [weekdayScope, startStr, endStr],
  );

  // Not scoped to the range toggle above — "what am I subscribed to"
  // shouldn't change when you zoom the category charts, so this always
  // looks at the full history handed in (the last 6 months).
  const subscriptions = useMemo(() => computeRecurringSubscriptions(transactions), [transactions]);

  function selectCategory(key: string) {
    setSelectedCategory((prev) => (prev === key ? null : key));
    setSelectedSubcategory(null);
    setHighlightedMerchant(null);
  }

  function selectDrillRow(key: string) {
    if (!effectiveSubcategory) {
      // First click at this depth drills into the subcategory.
      setSelectedSubcategory((prev) => (prev === key ? null : key));
      setHighlightedMerchant(null);
    } else {
      // Already at merchant depth — nothing further to drill into, just highlight.
      setHighlightedMerchant((prev) => (prev === key ? null : key));
    }
  }

  const rangeToggle = (
    <div className="flex gap-1 rounded-full border border-black/[.08] p-0.5 dark:border-white/[.1] creamsicle:border-orange-200">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => setRange(r.key)}
          className={
            range === r.key
              ? "rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
              : "rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 creamsicle:hover:text-orange-800"
          }
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Category tier — one bordered box so it's visually obvious the
          range toggle on the left controls every panel inside it. */}
      <div className="flex flex-col gap-4 rounded-xl border border-black/[.08] p-4 dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/40">
        <div className="flex flex-wrap items-center gap-3">
          {rangeToggle}
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">Spending by category</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
            <SpendingList items={categoryData} selectedKey={effectiveCategory} onSelect={selectCategory} />
          </div>
          <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
            <p className="mb-2 text-xs text-zinc-500">Click a category to isolate it</p>
            <SpendingBarChart data={categoryData} mode="isolate" selectedKey={effectiveCategory} />
          </div>
          <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
            <p className="mb-2 text-xs text-zinc-500">Click a category to highlight it</p>
            <SpendingBarChart data={categoryData} mode="highlight" selectedKey={effectiveCategory} />
          </div>
          <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
            <SpendingPieChart data={categoryData} selectedKey={effectiveCategory} />
          </div>
        </div>

        {/* Subcategory tier lives inside the same box, just under a
            divider — one range toggle up top controls every panel in
            both rows, so they read as one connected unit, not two. */}
        {effectiveCategory ? (
          <div className="flex flex-col gap-4 border-t border-black/[.08] pt-4 dark:border-white/[.1] creamsicle:border-orange-200">
            <div className="flex flex-wrap items-center gap-3">
              {effectiveSubcategory && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubcategory(null);
                    setHighlightedMerchant(null);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:hover:bg-orange-500"
                >
                  ← Back to subcategories
                </button>
              )}
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
                {effectiveSubcategory
                  ? `${formatCategoryLabel(effectiveSubcategory)} — specific merchants`
                  : `${formatCategoryLabel(effectiveCategory)} — subcategories`}
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
                <SpendingList
                  items={drillData}
                  selectedKey={effectiveSubcategory ? highlightedMerchant : effectiveSubcategory}
                  onSelect={selectDrillRow}
                />
              </div>
              <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
                <SpendingBarChart
                  data={drillData}
                  mode="highlight"
                  selectedKey={effectiveSubcategory ? highlightedMerchant : effectiveSubcategory}
                />
              </div>
              <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
                <p className="mb-2 text-xs text-zinc-500">Average spending by day of week</p>
                <WeekdaySpendingChart data={weekdayData} />
              </div>
              <div className="rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
                <SpendingPieChart
                  data={drillData}
                  selectedKey={effectiveSubcategory ? highlightedMerchant : effectiveSubcategory}
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="border-t border-black/[.08] pt-4 text-sm text-zinc-500 dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:text-orange-700">
            Select a category above to break it down further.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/40">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">Recurring subscriptions</h2>
        <RecurringSubscriptions subscriptions={subscriptions} />
      </div>
    </div>
  );
}
