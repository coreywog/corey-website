"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "@/components/finance/SearchableSelect";
import { GraphIcon, TextIcon, LineChartIcon, BarChartIcon, PieChartIcon, StatIcon, TableIcon, ScatterIcon } from "./icons";
import { Widget, type WidgetWithData } from "./Widget";
import type { WidgetConfig, ChartWidgetConfig, WidgetType, Metric, GroupBy } from "@/lib/dashboardConfig";
import { WIDGET_COLORS } from "@/lib/dashboardConfig";

type CategoryOption = { category: string; subcategory: string };
type Account = { id: string; name: string };
type ChartType = Exclude<WidgetType, "text">;

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

const CHART_TYPE_OPTIONS: { value: ChartType; label: string; Icon: typeof LineChartIcon }[] = [
  { value: "line", label: "Line", Icon: LineChartIcon },
  { value: "bar", label: "Bar", Icon: BarChartIcon },
  { value: "pie", label: "Pie", Icon: PieChartIcon },
  { value: "scatter", label: "Scatter", Icon: ScatterIcon },
  { value: "stat", label: "Stat", Icon: StatIcon },
  { value: "table", label: "Table", Icon: TableIcon },
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
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// What's actually in the "transactions" data source — every account draws
// from the same table, so unlike a real multi-source tool there's no
// per-account variation to show here. Purely informational (see Metric/
// Group by above for where these actually get used); D/T/# mark date/text/
// numeric the same way the very first sketch of this panel did.
const TRANSACTION_FIELDS: { name: string; kind: "D" | "T" | "#" }[] = [
  { name: "Date", kind: "D" },
  { name: "Amount", kind: "#" },
  { name: "Merchant", kind: "T" },
  { name: "Category", kind: "T" },
  { name: "Subcategory", kind: "T" },
  { name: "Account", kind: "T" },
];

type DateRangeMode = "relative" | "specific" | "allTime" | "custom";

const selectClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";
const labelClasses = "text-xs text-zinc-500";
const pillClasses = (active: boolean) =>
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
  (active
    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
    : "border-black/[.12] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50");
const squareClasses = (active: boolean) =>
  "flex h-10 w-10 items-center justify-center rounded-md border transition-colors " +
  (active
    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
    : "border-black/[.12] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50");

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Add/edit panel for one widget — a left-side drawer, not a centered modal.
 * Laid out as two columns once a type is picked: data sources on the left,
 * chart type/config and (below it) filters-and-style on the right — filters
 * stay hidden until Graph or Text is actually chosen, so a brand-new widget
 * starts as just two icons, not a wall of fields (an existing widget being
 * re-opened skips that reveal — its type was already chosen). It no longer
 * renders its own preview box: instead it reports the live config + fetched
 * result up via onDraftChange, and the actual grid slot (DashboardGrid.tsx)
 * shows the preview in place, so sizing it is just dragging/resizing that
 * same tile like any other.
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

  // Only ever the chart half of WidgetConfig — undefined for a brand-new
  // widget or one whose stored config is a text tile. Every existing?.config
  // read below goes through this instead of touching the union directly.
  const chartConfig = existing?.config.dataSource === "transactions" ? existing.config : undefined;

  const [type, setType] = useState<WidgetType>(existing?.type ?? "bar");
  // A brand-new widget starts collapsed to just the two type icons — chart
  // config and filters/style only reveal once one is clicked. An existing
  // widget being re-opened already has a type, so skip the reveal.
  const [typeChosen, setTypeChosen] = useState(Boolean(existing));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [text, setText] = useState(existing?.config.dataSource === "text" ? existing.config.text : "");
  const [color, setColor] = useState<string | undefined>(chartConfig?.color);
  // What's actually typed in the hex text field — kept separate from
  // `color` so an in-progress, not-yet-valid value (e.g. "#12") doesn't get
  // stomped by a controlled input snapping back to the last valid color.
  const [hexDraft, setHexDraft] = useState(chartConfig?.color ?? "");

  function pickColor(next: string) {
    setColor(next);
    setHexDraft(next);
  }

  function clearColor() {
    setColor(undefined);
    setHexDraft("");
  }
  const [metric, setMetric] = useState<Metric>(chartConfig?.metric ?? "spendingTotal");
  const [groupBy, setGroupBy] = useState<GroupBy | "">(chartConfig?.groupBy ?? "merchantCategory");
  const [dateMode, setDateMode] = useState<DateRangeMode>(chartConfig?.dateRange.mode ?? "relative");
  const [relativeMonths, setRelativeMonths] = useState<1 | 3 | 6 | 12>(
    chartConfig?.dateRange.mode === "relative" ? chartConfig.dateRange.months : 6,
  );
  const [specificMonth, setSpecificMonth] = useState(
    chartConfig?.dateRange.mode === "specific" ? chartConfig.dateRange.month : "",
  );
  const [customStart, setCustomStart] = useState(
    chartConfig?.dateRange.mode === "custom" ? chartConfig.dateRange.start : "",
  );
  const [customEnd, setCustomEnd] = useState(chartConfig?.dateRange.mode === "custom" ? chartConfig.dateRange.end : "");
  const [accountIds, setAccountIds] = useState<string[]>(chartConfig?.filters?.accountIds ?? []);
  const [merchantCategories, setMerchantCategories] = useState<string[]>(chartConfig?.filters?.merchantCategories ?? []);
  const [merchantSubcategories, setMerchantSubcategories] = useState<string[]>(
    chartConfig?.filters?.merchantSubcategories ?? [],
  );
  const [transactionCategory, setTransactionCategory] = useState<string>(chartConfig?.filters?.transactionCategory ?? "");
  const [limit, setLimit] = useState(chartConfig?.limit ? String(chartConfig.limit) : "");
  const [compareToPrevious, setCompareToPrevious] = useState(chartConfig?.compareToPrevious ?? false);
  const [xAxisLabel, setXAxisLabel] = useState(chartConfig?.axisLabels?.x ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(chartConfig?.axisLabels?.y ?? "");

  const [preview, setPreview] = useState<WidgetWithData["result"] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [availableRange, setAvailableRange] = useState<{ earliest: string | null; latest: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isText = type === "text";
  const categories = useMemo(() => [...new Set(categoryOptions.map((c) => c.category))].sort(), [categoryOptions]);
  // Subcategories available to drill into, scoped to whichever categories
  // are currently selected — picking "Dining" first is what makes its
  // subcategories ("Coffee shops", "Restaurants", ...) show up at all.
  const subcategoriesForSelectedCategories = useMemo(
    () =>
      [...new Set(categoryOptions.filter((c) => merchantCategories.includes(c.category)).map((c) => c.subcategory))].sort(),
    [categoryOptions, merchantCategories],
  );

  // Scatter plots one point per raw transaction (see lib/dashboardQuery.ts)
  // instead of one point per bucket, so it has no groupBy at all — closer
  // kin to a stat tile in that respect, even though it renders a chart.
  const isScatter = type === "scatter";
  const needsGroupBy = !isText && !isScatter && type !== "stat";
  const showCategoryFilter = groupBy !== "merchantCategory";
  const isTimeSeries = groupBy === "day" || groupBy === "month";
  const showLimit = needsGroupBy && groupBy !== "" && !isTimeSeries && (type === "bar" || type === "pie");
  const showTransactionCategoryFilter = metric === "net" || metric === "transactionCount";
  const showAxisLabels = type === "line" || type === "bar" || isScatter;
  const showColor = type === "line" || type === "stat";
  // Every account explicitly checked, individually, one at a time — not the
  // same as an empty selection (which means "no filter, use the same
  // cash-flow-account default every other page uses"). Selecting every
  // single account by hand is a real, different choice: it also includes
  // ones normally excluded from cash flow (e.g. PayPal), because the user
  // asked for them by name.
  const allAccountsChecked = accounts.length > 0 && accounts.every((a) => accountIds.includes(a.id));

  // Memoized, not recomputed-and-thrown-away every render: this is used as
  // a useEffect dependency below (both the preview fetch and the
  // onDraftChange report-up), and a fresh object literal on every render
  // would make those effects fire every render — including ones *they*
  // themselves trigger via setState, which is an infinite loop, not just
  // wasted work. Keyed on the actual primitive fields, not on anything
  // derived (`filters`, `dateRange`) that would itself be a fresh object.
  const config: WidgetConfig | null = useMemo(() => {
    if (isText) {
      return text.trim() ? { dataSource: "text", text: text.trim() } : null;
    }
    if (needsGroupBy && !groupBy) return null;
    if (dateMode === "specific" && !specificMonth) return null;
    if (dateMode === "custom" && (!customStart || !customEnd)) return null;

    const dateRange: ChartWidgetConfig["dateRange"] =
      dateMode === "allTime"
        ? { mode: "allTime" }
        : dateMode === "specific"
          ? { mode: "specific", month: specificMonth }
          : dateMode === "custom"
            ? { mode: "custom", start: customStart, end: customEnd }
            : { mode: "relative", months: relativeMonths };

    const filters: NonNullable<ChartWidgetConfig["filters"]> = {
      ...(accountIds.length ? { accountIds } : {}),
      ...(showCategoryFilter && merchantCategories.length ? { merchantCategories } : {}),
      ...(showCategoryFilter && merchantSubcategories.length ? { merchantSubcategories } : {}),
      ...(showTransactionCategoryFilter && transactionCategory
        ? { transactionCategory: transactionCategory as "income" | "spending" | "transfer" | "other" }
        : {}),
    };

    const axisLabels: ChartWidgetConfig["axisLabels"] =
      showAxisLabels && (xAxisLabel.trim() || yAxisLabel.trim())
        ? { ...(xAxisLabel.trim() ? { x: xAxisLabel.trim() } : {}), ...(yAxisLabel.trim() ? { y: yAxisLabel.trim() } : {}) }
        : undefined;

    return {
      dataSource: "transactions",
      metric,
      ...(needsGroupBy ? { groupBy: groupBy as GroupBy } : {}),
      dateRange,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...((showLimit || isScatter) && limit ? { limit: Number(limit) } : {}),
      ...(type === "stat" ? { compareToPrevious } : {}),
      ...(axisLabels ? { axisLabels } : {}),
      ...(showColor && color ? { color } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showCategoryFilter/showLimit/showTransactionCategoryFilter/needsGroupBy/showAxisLabels/showColor are all derived from type/metric/groupBy, already listed.
  }, [
    isText,
    text,
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
    color,
  ]);

  // Live preview — debounced, cancels a stale in-flight request rather than
  // letting it race a newer one and overwrite the preview with old data. A
  // text tile has no data behind it — it's a pure, synchronous derivation of
  // `text` (see the onDraftChange effect below), so it never touches this
  // effect or `preview` state at all.
  useEffect(() => {
    if (!config || config.dataSource === "text") return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/dashboards/widgets/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, config }),
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
  }, [isText, text, type, metric, groupBy, dateMode, relativeMonths, specificMonth, customStart, customEnd, accountIds, merchantCategories, merchantSubcategories, transactionCategory, limit, compareToPrevious, color]);

  // Shared by the dedicated preview panel below (rendered right next to the
  // form, since the actual grid tile can be scrolled away or hard to spot)
  // and by the onDraftChange report-up just after it (which still drives
  // the in-place ghost-tile preview in the real grid). Memoized so its
  // identity only changes when one of these actually does — otherwise it'd
  // be a fresh object every render, defeating the effect below the same way
  // an inline literal would.
  const draftResult: WidgetWithData["result"] = useMemo(() => {
    if (!config) return { error: isText ? "Type something to see a preview." : "Fill in the fields to see a preview." };
    if (config.dataSource === "text") return { kind: "text", text: config.text };
    return preview ?? { error: previewLoading ? "Loading…" : "Fill in the fields to see a preview." };
  }, [config, isText, preview, previewLoading]);

  // Reports the current draft up to DashboardGrid, which renders it in the
  // actual grid slot too — sizing/dragging the ghost tile still works the
  // same way. Runs whenever anything the preview depends on changes, and
  // clears on unmount so closing the panel drops the in-place preview too.
  useEffect(() => {
    onDraftChange({ type, title: title.trim() || null, result: draftResult, config });
    return () => onDraftChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDraftChange is a stable setter from the parent; draftResult is derived fresh from config/preview/previewLoading/isText every render, all already tracked.
  }, [type, title, config, draftResult]);

  // The available date range depends on which accounts are in scope —
  // different accounts can have very different histories (see
  // app/api/dashboards/widgets/date-range/route.ts) — so it's re-asked
  // whenever the account filter changes, debounced the same way. Meaningless
  // for a text tile, so skipped entirely.
  useEffect(() => {
    if (isText) return;
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
  }, [isText, accountIds]);

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

  function pickType(next: WidgetType) {
    setType(next);
    setTypeChosen(true);
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
          "fixed inset-y-0 left-0 z-30 flex w-full max-w-xl flex-col gap-4 overflow-y-auto border-r border-black/[.1] bg-[var(--background)] p-5 shadow-xl transition-transform duration-200 ease-out dark:border-white/[.15] creamsicle:border-orange-300 " +
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
          <span className={labelClasses}>Title (optional — auto-generated if left blank)</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={selectClasses} />
        </label>

        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start gap-4">
          {/* Left column: which accounts feed this widget — hidden for a
              text tile, which has no data behind it at all. */}
          {!isText && (
            <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
              <span className={labelClasses}>Data sources</span>
              <label className="flex items-center gap-2 border-b border-black/[.06] pb-2 text-sm dark:border-white/[.08]">
                <input
                  type="checkbox"
                  checked={allAccountsChecked || accountIds.length === 0}
                  onChange={() => setAccountIds([])}
                />
                All connected accounts
              </label>
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
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

              <div className="flex flex-col gap-1 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                <span className="text-[11px] text-zinc-500">Columns available (used via Metric / Group by)</span>
                {TRANSACTION_FIELDS.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="w-3 font-mono font-medium text-zinc-400 dark:text-zinc-500">{f.kind}</span>
                    {f.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Right column: what kind of tile, then (once picked) its
              type-specific config, then filters/style below that. */}
          <div className={"flex flex-col gap-3" + (isText ? " col-span-2" : "")}>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => pickType("bar")}
                className={squareClasses(!isText)}
                title="Graph"
                aria-label="Graph"
              >
                <GraphIcon />
              </button>
              <button
                type="button"
                onClick={() => pickType("text")}
                className={squareClasses(isText)}
                title="Text"
                aria-label="Text"
              >
                <TextIcon />
              </button>
            </div>

            {typeChosen && isText && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type what this tile should say"
                rows={4}
                className={selectClasses}
              />
            )}

            {typeChosen && !isText && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {CHART_TYPE_OPTIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={squareClasses(type === value)}
                      title={label}
                      aria-label={label}
                    >
                      <Icon />
                    </button>
                  ))}
                </div>

                <label className="flex flex-col gap-1">
                  <span className={labelClasses}>Metric</span>
                  <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className={selectClasses}>
                    {/* "Transaction count" is meaningless per-point (every
                        scatter point is exactly one transaction) — hidden
                        rather than allowed to produce a flat line of dots. */}
                    {METRIC_OPTIONS.filter((o) => !isScatter || o.value !== "transactionCount").map((o) => (
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

                {(showLimit || isScatter) && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClasses}>
                      {isScatter ? "Max points (most recent)" : 'Top N (rest folds into "Other")'}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={isScatter ? 1000 : 100}
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
              </>
            )}

            {/* Nothing in here applies to a text tile (no color, no data
                filters) — showing an empty box would just look broken. */}
            {typeChosen && !isText && (
              <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
                <span className={labelClasses}>Filters and style</span>

                {showColor && (
                  <div className="flex items-center gap-1.5">
                    {WIDGET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => (color === c ? clearColor() : pickColor(c))}
                        aria-label={`Color ${c}`}
                        className={
                          "h-6 w-6 rounded-full border-2 transition-transform " +
                          (color === c ? "scale-110 border-zinc-900 dark:border-zinc-50" : "border-transparent")
                        }
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    {/* Open picker — its swatch face always shows some
                        color, so it doubles as a 7th preset once you've
                        used it once (defaults to the first preset only for
                        its own display, not as a selection). */}
                    <input
                      type="color"
                      value={color ?? WIDGET_COLORS[0]}
                      onChange={(e) => pickColor(e.target.value)}
                      title="Custom color"
                      aria-label="Custom color"
                      className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={hexDraft}
                      onChange={(e) => {
                        const v = e.target.value;
                        setHexDraft(v);
                        if (HEX_COLOR_PATTERN.test(v)) setColor(v);
                      }}
                      onBlur={() => {
                        // Reverts a half-typed, never-valid hex back to
                        // whatever color is actually in effect, rather than
                        // leaving the field stuck showing something that
                        // was never applied.
                        if (!HEX_COLOR_PATTERN.test(hexDraft)) setHexDraft(color ?? "");
                      }}
                      placeholder="#RRGGBB"
                      maxLength={7}
                      className={selectClasses + " w-24 font-mono text-xs"}
                    />
                  </div>
                )}

                {!isText && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] text-zinc-500">Date range</span>
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
                                  // Drop any subcategory that only belonged to
                                  // the category just removed — leaving it
                                  // selected would silently keep filtering by
                                  // something no longer reachable from the UI.
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

                        {/* Only appears once at least one category is
                            selected — lets a widget narrow further, e.g.
                            "Dining" -> just "Coffee shops", instead of the
                            whole category. */}
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
                  </>
                )}
              </div>
            )}
          </div>
        </div>

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

      {/* A dedicated, always-in-the-same-spot preview, docked to the
          drawer's own right edge — the actual grid slot this widget will
          occupy (still driven by the same draft via onDraftChange, for
          sizing/dragging) can end up scrolled away or easy to miss. A
          sibling of the drawer, not a child: the drawer's overflow-y-auto
          implicitly clips overflow-x too (a real CSS quirk — declaring only
          one axis forces the other to `auto` as well), so an absolutely-
          positioned child would just get cut off. left-[36rem] matches the
          drawer's own max-w-xl exactly, which is safe only because this
          whole panel is hidden below `lg` (1024px) — comfortably wider than
          the drawer's 576px cap, so the drawer is always at that exact
          width whenever this is visible. Hidden below `lg` at all: the
          drag/resize grid builder is a desktop tool already, and there's no
          room for a second panel next to a narrow drawer. */}
      <div
        className={
          "fixed inset-y-0 left-[36rem] z-30 hidden w-80 flex-col gap-2 border-r border-black/[.1] bg-[var(--background)] p-4 transition-transform duration-200 ease-out lg:flex dark:border-white/[.15] creamsicle:border-orange-300 " +
          (mounted ? "translate-x-0" : "-translate-x-full")
        }
      >
        <span className={labelClasses}>Preview</span>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.1]">
          <Widget
            widget={{ id: "__preview__", type, title: title.trim() || null, x: 0, y: 0, w: 0, h: 0, result: draftResult, config }}
          />
        </div>
      </div>
    </>
  );
}
