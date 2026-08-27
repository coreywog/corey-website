"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
import { Widget, type WidgetWithData } from "./Widget";
import type { WidgetConfig, WidgetType, Metric, GroupBy } from "@/lib/dashboardConfig";

type CategoryOption = { category: string; subcategory: string };
type Account = { id: string; name: string };

export type ExistingWidget = {
  id: string;
  type: WidgetType;
  title: string | null;
  config: WidgetConfig;
};

const WIDGET_TYPE_OPTIONS: { value: WidgetType; label: string }[] = [
  { value: "line", label: "Line chart" },
  { value: "bar", label: "Bar chart" },
  { value: "pie", label: "Pie chart" },
  { value: "stat", label: "Stat tile" },
  { value: "table", label: "Table" },
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

type DateRangeMode = "relative" | "specific" | "allTime";

const selectClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";
const labelClasses = "text-xs text-zinc-500";

function defaultConfigFor(type: WidgetType): WidgetConfig {
  return {
    dataSource: "transactions",
    metric: type === "stat" ? "net" : "spendingTotal",
    groupBy: type === "stat" || type === "table" ? undefined : type === "pie" ? "merchantCategory" : "day",
    dateRange: { mode: "relative", months: 6 },
  };
}

/**
 * Add/edit panel for one widget. Live preview renders through the same
 * <Widget> component the real grid uses (Widget.tsx) — what's shown here is
 * exactly what saving will produce, not a simplified stand-in.
 */
export function WidgetEditorPanel({
  dashboardId,
  accounts,
  categoryOptions,
  existing,
  onClose,
  onSaved,
}: {
  dashboardId: string;
  accounts: Account[];
  categoryOptions: CategoryOption[];
  existing?: ExistingWidget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<WidgetType>(existing?.type ?? "bar");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [metric, setMetric] = useState<Metric>(existing?.config.metric ?? defaultConfigFor(type).metric);
  const [groupBy, setGroupBy] = useState<GroupBy | "">(existing?.config.groupBy ?? "merchantCategory");
  const [dateMode, setDateMode] = useState<DateRangeMode>(existing?.config.dateRange.mode ?? "relative");
  const [relativeMonths, setRelativeMonths] = useState<1 | 3 | 6 | 12>(
    existing?.config.dateRange.mode === "relative" ? existing.config.dateRange.months : 6,
  );
  const [specificMonth, setSpecificMonth] = useState(
    existing?.config.dateRange.mode === "specific" ? existing.config.dateRange.month : "",
  );
  const [accountIds, setAccountIds] = useState<string[]>(existing?.config.filters?.accountIds ?? []);
  const [merchantCategories, setMerchantCategories] = useState<string[]>(
    existing?.config.filters?.merchantCategories ?? [],
  );
  const [transactionCategory, setTransactionCategory] = useState<string>(
    existing?.config.filters?.transactionCategory ?? "",
  );
  const [limit, setLimit] = useState(existing?.config.limit ? String(existing.config.limit) : "");
  const [compareToPrevious, setCompareToPrevious] = useState(existing?.config.compareToPrevious ?? false);

  const [preview, setPreview] = useState<WidgetWithData["result"] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(categoryOptions.map((c) => c.category))].sort(), [categoryOptions]);

  const needsGroupBy = type !== "stat";
  // A category filter that matches the current groupBy is redundant (every
  // group would already be scoped to it) — hide it rather than leave a
  // confusing no-op control visible.
  const showCategoryFilter = groupBy !== "merchantCategory";
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  const showLimit = needsGroupBy && groupBy !== "" && !isTimeSeries && (type === "bar" || type === "pie");
  const showTransactionCategoryFilter = metric === "net" || metric === "transactionCount";

  function buildConfig(): WidgetConfig | null {
    if (needsGroupBy && !groupBy) return null;
    if (dateMode === "specific" && !specificMonth) return null;

    const dateRange: WidgetConfig["dateRange"] =
      dateMode === "allTime"
        ? { mode: "allTime" }
        : dateMode === "specific"
          ? { mode: "specific", month: specificMonth }
          : { mode: "relative", months: relativeMonths };

    const filters: WidgetConfig["filters"] = {
      ...(accountIds.length ? { accountIds } : {}),
      ...(showCategoryFilter && merchantCategories.length ? { merchantCategories } : {}),
      ...(showTransactionCategoryFilter && transactionCategory
        ? { transactionCategory: transactionCategory as "income" | "spending" | "transfer" | "other" }
        : {}),
    };

    return {
      dataSource: "transactions",
      metric,
      ...(needsGroupBy ? { groupBy: groupBy as GroupBy } : {}),
      dateRange,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(showLimit && limit ? { limit: Number(limit) } : {}),
      ...(type === "stat" ? { compareToPrevious } : {}),
    };
  }

  const config = buildConfig();

  // Live preview — debounced, cancels a stale in-flight request rather than
  // letting it race a newer one and overwrite the preview with old data.
  useEffect(() => {
    // Nothing to fetch — previewWidget below falls back to a placeholder
    // message directly from `config` being null, no state update needed
    // here for that case.
    if (!config) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/dashboards/widgets/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
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
  }, [type, metric, groupBy, dateMode, relativeMonths, specificMonth, accountIds, merchantCategories, transactionCategory, limit, compareToPrevious]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const body = { type, title: title.trim() || null, config };
      const res = existing
        ? await fetch(`/api/dashboards/${dashboardId}/widgets/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/dashboards/${dashboardId}/widgets`, {
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

  const previewWidget: WidgetWithData = {
    id: "preview",
    type,
    title: title.trim() || null,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    config,
    result: !config
      ? { error: "Fill in the fields to see a preview." }
      : (preview ?? { error: previewLoading ? "Loading…" : "Fill in the fields to see a preview." }),
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-xl border border-black/[.1] bg-[var(--background)] p-5 dark:border-white/[.15] creamsicle:border-orange-300">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{existing ? "Edit widget" : "Add widget"}</h2>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Chart type</span>
            <select value={type} onChange={(e) => setType(e.target.value as WidgetType)} className={selectClasses}>
              {WIDGET_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClasses}>Metric</span>
            <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className={selectClasses}>
              {METRIC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

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

          {showLimit && (
            <label className="flex flex-col gap-1">
              <span className={labelClasses}>Top N (rest folds into &quot;Other&quot;)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="No limit"
                className={selectClasses}
              />
            </label>
          )}

          {type === "stat" && (
            <label className="flex items-center gap-2 pt-5">
              <input type="checkbox" checked={compareToPrevious} onChange={(e) => setCompareToPrevious(e.target.checked)} />
              <span className="text-sm">Compare to prior period</span>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className={labelClasses}>Date range</span>
          <div className="flex flex-wrap items-center gap-2">
            {([1, 3, 6, 12] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setDateMode("relative");
                  setRelativeMonths(m);
                }}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                  (dateMode === "relative" && relativeMonths === m
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
                    : "border-black/[.12] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50")
                }
              >
                {m} {m === 1 ? "month" : "months"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDateMode("allTime")}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                (dateMode === "allTime"
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
                  : "border-black/[.12] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50")
              }
            >
              All time
            </button>
            <input
              type="month"
              value={specificMonth}
              onChange={(e) => {
                setSpecificMonth(e.target.value);
                setDateMode("specific");
              }}
              className={selectClasses}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
          <span className={labelClasses}>Filters (optional)</span>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-zinc-500">Accounts</span>
              <div className="flex max-h-24 flex-col gap-1 overflow-y-auto rounded-md border border-black/[.08] p-2 dark:border-white/[.1]">
                {accounts.map((a) => (
                  <label key={a.id} className="flex items-center gap-1.5 text-xs">
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
            </div>

            {showCategoryFilter && (
              <div className="flex min-w-[10rem] flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Categories</span>
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

            {showTransactionCategoryFilter && (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Transaction type</span>
                <select
                  value={transactionCategory}
                  onChange={(e) => setTransactionCategory(e.target.value)}
                  className={selectClasses}
                >
                  <option value="">Any</option>
                  {TRANSACTION_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
          <span className={labelClasses}>Title (optional — auto-generated if left blank)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={selectClasses} />
        </label>

        <div className="flex flex-col gap-2 border-t border-black/[.06] pt-3 dark:border-white/[.08]">
          <span className={labelClasses}>Preview</span>
          <div className="h-56 rounded-xl border border-black/[.08] dark:border-white/[.1]">
            <Widget widget={previewWidget} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
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
    </div>
  );
}
