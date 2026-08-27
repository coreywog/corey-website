"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
import type { WidgetWithData } from "./Widget";
import type { WidgetConfig, WidgetType, Metric, GroupBy } from "@/lib/dashboardConfig";

type CategoryOption = { category: string; subcategory: string };
type Account = { id: string; name: string };

export type ExistingWidget = {
  id: string;
  type: WidgetType;
  title: string | null;
  config: WidgetConfig;
};

export type WidgetDraft = {
  type: WidgetType;
  title: string | null;
  result: WidgetWithData["result"];
  config: WidgetConfig | null;
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

type DateRangeMode = "relative" | "specific" | "allTime" | "custom";

const selectClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";
const labelClasses = "text-xs text-zinc-500";
const pillClasses = (active: boolean) =>
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
  (active
    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
    : "border-black/[.12] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50");

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Add/edit panel for one widget — a left-side drawer, not a centered modal.
 * It no longer renders its own preview box: instead it reports the live
 * config + fetched result up via onDraftChange, and the actual grid slot
 * (DashboardGrid.tsx) shows the preview in place, so sizing it is just
 * dragging/resizing that same tile like any other.
 */
export function WidgetEditorPanel({
  dashboardId,
  tabId,
  accounts,
  categoryOptions,
  existing,
  ghostLayout,
  onClose,
  onSaved,
  onDraftChange,
}: {
  dashboardId: string;
  tabId: string;
  accounts: Account[];
  categoryOptions: CategoryOption[];
  existing?: ExistingWidget;
  // The not-yet-real widget's current position/size in the grid (add mode
  // only) — read at Save time so the size the user dragged it to is what
  // gets created, not the API's own generic default.
  ghostLayout?: { x: number; y: number; w: number; h: number };
  onClose: () => void;
  onSaved: () => void;
  onDraftChange: (draft: WidgetDraft | null) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const [type, setType] = useState<WidgetType>(existing?.type ?? "bar");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [metric, setMetric] = useState<Metric>(existing?.config.metric ?? "spendingTotal");
  const [groupBy, setGroupBy] = useState<GroupBy | "">(existing?.config.groupBy ?? "merchantCategory");
  const [dateMode, setDateMode] = useState<DateRangeMode>(existing?.config.dateRange.mode ?? "relative");
  const [relativeMonths, setRelativeMonths] = useState<1 | 3 | 6 | 12>(
    existing?.config.dateRange.mode === "relative" ? existing.config.dateRange.months : 6,
  );
  const [specificMonth, setSpecificMonth] = useState(
    existing?.config.dateRange.mode === "specific" ? existing.config.dateRange.month : "",
  );
  const [customStart, setCustomStart] = useState(
    existing?.config.dateRange.mode === "custom" ? existing.config.dateRange.start : "",
  );
  const [customEnd, setCustomEnd] = useState(
    existing?.config.dateRange.mode === "custom" ? existing.config.dateRange.end : "",
  );
  const [accountIds, setAccountIds] = useState<string[]>(existing?.config.filters?.accountIds ?? []);
  const [merchantCategories, setMerchantCategories] = useState<string[]>(
    existing?.config.filters?.merchantCategories ?? [],
  );
  const [merchantSubcategories, setMerchantSubcategories] = useState<string[]>(
    existing?.config.filters?.merchantSubcategories ?? [],
  );
  const [transactionCategory, setTransactionCategory] = useState<string>(
    existing?.config.filters?.transactionCategory ?? "",
  );
  const [limit, setLimit] = useState(existing?.config.limit ? String(existing.config.limit) : "");
  const [compareToPrevious, setCompareToPrevious] = useState(existing?.config.compareToPrevious ?? false);
  const [xAxisLabel, setXAxisLabel] = useState(existing?.config.axisLabels?.x ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(existing?.config.axisLabels?.y ?? "");

  const [preview, setPreview] = useState<WidgetWithData["result"] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [availableRange, setAvailableRange] = useState<{ earliest: string | null; latest: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(categoryOptions.map((c) => c.category))].sort(), [categoryOptions]);
  // Subcategories available to drill into, scoped to whichever categories
  // are currently selected — picking "Dining" first is what makes its
  // subcategories ("Coffee shops", "Restaurants", ...) show up at all.
  const subcategoriesForSelectedCategories = useMemo(
    () =>
      [...new Set(categoryOptions.filter((c) => merchantCategories.includes(c.category)).map((c) => c.subcategory))].sort(),
    [categoryOptions, merchantCategories],
  );

  const needsGroupBy = type !== "stat";
  const showCategoryFilter = groupBy !== "merchantCategory";
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  const showLimit = needsGroupBy && groupBy !== "" && !isTimeSeries && (type === "bar" || type === "pie");
  const showTransactionCategoryFilter = metric === "net" || metric === "transactionCount";
  const showAxisLabels = type === "line" || type === "bar";

  // Memoized, not recomputed-and-thrown-away every render: this is used as
  // a useEffect dependency below (both the preview fetch and the
  // onDraftChange report-up), and a fresh object literal on every render
  // would make those effects fire every render — including ones *they*
  // themselves trigger via setState, which is an infinite loop, not just
  // wasted work. Keyed on the actual primitive fields, not on anything
  // derived (`filters`, `dateRange`) that would itself be a fresh object.
  const config: WidgetConfig | null = useMemo(() => {
    if (needsGroupBy && !groupBy) return null;
    if (dateMode === "specific" && !specificMonth) return null;
    if (dateMode === "custom" && (!customStart || !customEnd)) return null;

    const dateRange: WidgetConfig["dateRange"] =
      dateMode === "allTime"
        ? { mode: "allTime" }
        : dateMode === "specific"
          ? { mode: "specific", month: specificMonth }
          : dateMode === "custom"
            ? { mode: "custom", start: customStart, end: customEnd }
            : { mode: "relative", months: relativeMonths };

    const filters: WidgetConfig["filters"] = {
      ...(accountIds.length ? { accountIds } : {}),
      ...(showCategoryFilter && merchantCategories.length ? { merchantCategories } : {}),
      ...(showCategoryFilter && merchantSubcategories.length ? { merchantSubcategories } : {}),
      ...(showTransactionCategoryFilter && transactionCategory
        ? { transactionCategory: transactionCategory as "income" | "spending" | "transfer" | "other" }
        : {}),
    };

    const axisLabels: WidgetConfig["axisLabels"] =
      showAxisLabels && (xAxisLabel.trim() || yAxisLabel.trim())
        ? { ...(xAxisLabel.trim() ? { x: xAxisLabel.trim() } : {}), ...(yAxisLabel.trim() ? { y: yAxisLabel.trim() } : {}) }
        : undefined;

    return {
      dataSource: "transactions",
      metric,
      ...(needsGroupBy ? { groupBy: groupBy as GroupBy } : {}),
      dateRange,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(showLimit && limit ? { limit: Number(limit) } : {}),
      ...(type === "stat" ? { compareToPrevious } : {}),
      ...(axisLabels ? { axisLabels } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showCategoryFilter/showLimit/showTransactionCategoryFilter/needsGroupBy/showAxisLabels are all derived from type/metric/groupBy, already listed.
  }, [
    type,
    metric,
    groupBy,
    dateMode,
    relativeMonths,
    specificMonth,
    customStart,
    customEnd,
    accountIds,
    merchantCategories,
    merchantSubcategories,
    transactionCategory,
    limit,
    compareToPrevious,
    xAxisLabel,
    yAxisLabel,
  ]);

  // Live preview — debounced, cancels a stale in-flight request rather than
  // letting it race a newer one and overwrite the preview with old data.
  // Reported up to the parent (onDraftChange) rather than rendered here.
  useEffect(() => {
    // Nothing to fetch — the onDraftChange effect below already overrides
    // the displayed message directly from `config` being null, so `preview`
    // itself doesn't need clearing here.
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
  }, [type, metric, groupBy, dateMode, relativeMonths, specificMonth, customStart, customEnd, accountIds, merchantCategories, merchantSubcategories, transactionCategory, limit, compareToPrevious]);

  // Reports the current draft up to DashboardGrid, which renders it in the
  // actual grid slot — this is the "preview in the spot" behavior. Runs
  // whenever anything the preview depends on changes, and clears on unmount
  // so closing the panel drops the in-place preview too.
  useEffect(() => {
    onDraftChange({
      type,
      title: title.trim() || null,
      result: !config
        ? { error: "Fill in the fields to see a preview." }
        : (preview ?? { error: previewLoading ? "Loading…" : "Fill in the fields to see a preview." }),
      config,
    });
    return () => onDraftChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDraftChange is a stable setter from the parent; including it would re-fire this on every parent render.
  }, [type, title, config, preview, previewLoading]);

  // The available date range depends on which accounts are in scope —
  // different accounts can have very different histories (see
  // app/api/dashboards/widgets/date-range/route.ts) — so it's re-asked
  // whenever the account filter changes, debounced the same way.
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/dashboards/widgets/date-range", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountIds: accountIds.length ? accountIds : undefined }),
        });
        if (cancelled) return;
        if (res.ok) setAvailableRange(await res.json());
      } catch {
        // Non-critical — just a hint text, fine to silently skip on failure.
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [accountIds]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        type,
        title: title.trim() || null,
        config,
        ...(existing ? {} : { layout: ghostLayout }),
      };
      const res = existing
        ? await fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}/widgets/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}/widgets`, {
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

  return (
    <>
      {/* Click-outside-to-close, but no dimming overlay — the grid behind
          the drawer is exactly what's being configured (the ghost tile's
          live preview, or the widget you're editing in place), so it needs
          to stay fully visible, not darkened. */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={
          "fixed inset-y-0 left-0 z-30 flex w-full max-w-sm flex-col gap-4 overflow-y-auto border-r border-black/[.1] bg-[var(--background)] p-5 shadow-xl transition-transform duration-200 ease-out dark:border-white/[.15] creamsicle:border-orange-300 " +
          (mounted ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{existing ? "Edit widget" : "Add widget"}</h2>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>

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
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={compareToPrevious} onChange={(e) => setCompareToPrevious(e.target.checked)} />
            <span className="text-sm">Compare to prior period</span>
          </label>
        )}

        <div className="flex flex-col gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <span className={labelClasses}>Date range</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {([1, 3, 6, 12] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setDateMode("relative");
                  setRelativeMonths(m);
                }}
                className={pillClasses(dateMode === "relative" && relativeMonths === m)}
              >
                {m}mo
              </button>
            ))}
            <button type="button" onClick={() => setDateMode("allTime")} className={pillClasses(dateMode === "allTime")}>
              All time
            </button>
            <button type="button" onClick={() => setDateMode("specific")} className={pillClasses(dateMode === "specific")}>
              One month
            </button>
            <button type="button" onClick={() => setDateMode("custom")} className={pillClasses(dateMode === "custom")}>
              Custom range
            </button>
          </div>

          {dateMode === "specific" && (
            <input
              type="month"
              value={specificMonth}
              onChange={(e) => setSpecificMonth(e.target.value)}
              className={selectClasses}
            />
          )}
          {dateMode === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={selectClasses} />
              <span className="text-xs text-zinc-500">to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={selectClasses} />
            </div>
          )}

          {availableRange?.earliest && availableRange?.latest && (
            <p className="text-[11px] text-zinc-500">
              Data available: {formatDate(availableRange.earliest)} – {formatDate(availableRange.latest)}
              {accountIds.length > 0 ? " for the selected accounts" : ""}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <span className={labelClasses}>Filters (optional)</span>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">Accounts</span>
            <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-md border border-black/[.08] p-2 dark:border-white/[.1]">
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
            <div className="flex flex-col gap-1">
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
                      onClick={() => {
                        setMerchantCategories((prev) => prev.filter((x) => x !== c));
                        // Drop any subcategory that only belonged to the
                        // category just removed — leaving it selected would
                        // silently keep filtering by something no longer
                        // reachable from the UI.
                        const stillValid = new Set(
                          categoryOptions
                            .filter((opt) => opt.category !== c && merchantCategories.includes(opt.category))
                            .map((opt) => opt.subcategory),
                        );
                        setMerchantSubcategories((prev) => prev.filter((s) => stillValid.has(s)));
                      }}
                      className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                    >
                      {formatCategoryLabel(c)} ✕
                    </button>
                  ))}
                </div>
              )}

              {/* Only appears once at least one category is selected — lets
                  a widget narrow further, e.g. "Dining" -> just "Coffee
                  shops", instead of the whole category. */}
              {subcategoriesForSelectedCategories.length > 0 && (
                <div className="flex flex-col gap-1 pl-3">
                  <span className="text-[11px] text-zinc-500">Subcategories (optional — narrows further)</span>
                  <SearchableSelect
                    value=""
                    onChange={(v) => setMerchantSubcategories((prev) => (prev.includes(v) ? prev : [...prev, v]))}
                    options={subcategoriesForSelectedCategories
                      .filter((s) => !merchantSubcategories.includes(s))
                      .map((s) => ({ value: s, label: formatCategoryLabel(s) }))}
                    placeholder="Add subcategory…"
                  />
                  {merchantSubcategories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {merchantSubcategories.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setMerchantSubcategories((prev) => prev.filter((x) => x !== s))}
                          className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                        >
                          {formatCategoryLabel(s)} ✕
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showTransactionCategoryFilter && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-zinc-500">Transaction type</span>
              <select value={transactionCategory} onChange={(e) => setTransactionCategory(e.target.value)} className={selectClasses}>
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

        <label className="flex flex-col gap-1 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
          <span className={labelClasses}>Title (optional — auto-generated if left blank)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={selectClasses} />
        </label>

        {showAxisLabels && (
          <div className="flex flex-col gap-2">
            <span className={labelClasses}>Axis titles (optional)</span>
            <input
              type="text"
              value={xAxisLabel}
              onChange={(e) => setXAxisLabel(e.target.value)}
              placeholder="X axis title"
              className={selectClasses}
            />
            <input
              type="text"
              value={yAxisLabel}
              onChange={(e) => setYAxisLabel(e.target.value)}
              placeholder="Y axis title"
              className={selectClasses}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-auto flex justify-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
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
    </>
  );
}
