"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "./SearchableSelect";

export type ReviewTxn = {
  id: string;
  date: string;
  account: string;
  description: string;
  amount: number;
  rawName: string | null;
  location: string | null;
  website: string | null;
  paymentChannel: string | null;
  plaidDetailedCategory: string | null;
  merchantCategory: string | null;
  merchantSubcategory: string | null;
  reviewed: boolean;
};
type CategoryOption = { category: string; subcategory: string };

const NEW_VALUE = "__new__";

function formatAmount(amount: number) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function formatPlaidCategory(detailed: string): string {
  const words = detailed.toLowerCase().split("_");
  const mid = Math.min(3, Math.ceil(words.length / 2));
  const primary = words.slice(0, mid).join(" ");
  const specific = words.slice(mid).join(" ");
  return specific ? `${primary} · ${specific}` : primary;
}

function formatPaymentChannel(channel: string): string {
  if (channel === "in store") return "In store";
  if (channel === "online") return "Online";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

/** Everything below the description, condensed onto a single line. */
function TransactionDetail({ txn }: { txn: ReviewTxn }) {
  const parts = [
    txn.rawName,
    txn.location,
    txn.paymentChannel ? formatPaymentChannel(txn.paymentChannel) : null,
    txn.plaidDetailedCategory ? `Plaid: ${formatPlaidCategory(txn.plaidDetailedCategory)}` : null,
  ].filter(Boolean);

  if (parts.length === 0 && !txn.website) {
    return (
      <div className="truncate text-xs text-zinc-500">
        No further detail available — imported from a bank statement, not live-synced.
      </div>
    );
  }

  return (
    <div className="truncate text-xs text-zinc-500">
      {parts.join(" · ")}
      {txn.website && (
        <>
          {parts.length > 0 && " · "}
          <a
            href={txn.website.startsWith("http") ? txn.website : `https://${txn.website}`}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {txn.website}
          </a>
        </>
      )}
    </div>
  );
}

/**
 * One transaction's card in the Review tab. Always fully visible for a
 * needs-review card (defaultOpen=true, no accordion — the whole point is
 * fast, no-click-required scanning) or collapsed-by-default for an already
 * approved one (click to re-open the same form if a correction is needed
 * later). Category/subcategory selects are pre-filled with the current
 * best guess (which by this point already reflects Plaid's own suggestion
 * when nothing else recognized the merchant — see lib/plaidSync.ts) so
 * approving a correct guess is just one click.
 */
export function TransactionReviewCard({
  txn,
  categoryOptions,
  defaultOpen,
  onApproved,
}: {
  txn: ReviewTxn;
  categoryOptions: CategoryOption[];
  defaultOpen: boolean;
  // `sweep` is passed when a rule was saved — the caller uses it to also
  // remove/move any *other* currently-visible transaction that the same
  // rule just applied to server-side (see lib/merchantRules.ts's
  // saveRuleAndApply), not just this one card. exactAmount narrows the
  // sweep the same way it narrowed the rule itself.
  onApproved: (id: string, sweep?: { pattern: string; exactAmount: number | null }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  // "other" is the classifier's "couldn't guess" fallback, not a real,
  // pickable category — treat it the same as no guess at all, or the
  // select's value wouldn't match any real <option> and the browser would
  // silently fall back to displaying whichever option happens to sort first.
  const initialCategory = txn.merchantCategory && txn.merchantCategory !== "other" ? txn.merchantCategory : "";
  const initialSubcategory =
    txn.merchantSubcategory && txn.merchantSubcategory !== "other" ? txn.merchantSubcategory : "";
  const [category, setCategory] = useState(initialCategory);
  const [newCategory, setNewCategory] = useState("");
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const [newSubcategory, setNewSubcategory] = useState("");
  // "none": just this transaction. "name": every transaction with this same
  // merchant name, regardless of amount (e.g. any BMW charge). "exact":
  // only ones that also match this exact dollar amount (e.g. the monthly
  // loan payment specifically, not an occasional service charge that
  // happens to share the same merchant name).
  const [ruleMode, setRuleMode] = useState<"none" | "name" | "exact">("none");
  const [pattern, setPattern] = useState(txn.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(txn.reviewed);

  const categories = useMemo(
    () => [...new Set(categoryOptions.map((c) => c.category))].sort(),
    [categoryOptions],
  );
  const subcategoriesForCategory = useMemo(
    () => [...new Set(categoryOptions.filter((c) => c.category === category).map((c) => c.subcategory))].sort(),
    [categoryOptions, category],
  );

  const resolvedCategory = category === NEW_VALUE ? newCategory.trim() : category;
  const resolvedSubcategory = subcategory === NEW_VALUE ? newSubcategory.trim() : subcategory;
  const canApprove = resolvedCategory.length > 0 && resolvedSubcategory.length > 0;

  async function handleApprove() {
    if (!canApprove) return;
    setSaving(true);
    setError(null);
    const saveAsRule = ruleMode !== "none";
    const exactAmount = ruleMode === "exact" ? Math.abs(txn.amount) : null;
    try {
      const res = await fetch(`/api/finance/transactions/${txn.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantCategory: resolvedCategory,
          merchantSubcategory: resolvedSubcategory,
          ...(saveAsRule ? { saveAsRule: true, pattern: pattern.trim(), ...(exactAmount !== null ? { exactAmount } : {}) } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to save (${res.status}).`);
        return;
      }
      setApproved(true);
      onApproved(txn.id, saveAsRule ? { pattern: pattern.trim().toLowerCase(), exactAmount } : undefined);
      router.refresh(); // re-syncs sidebar counts / other tabs in the background
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectClasses =
    "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500";

  return (
    <div className="rounded-lg border border-black/[.14] shadow-sm dark:border-white/[.16] creamsicle:border-orange-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="w-16 shrink-0 text-xs text-zinc-500">{txn.date.slice(5)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{txn.description}</span>
          <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline">{txn.account}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {approved && <span className="text-emerald-600 dark:text-emerald-400 creamsicle:text-orange-600">✓</span>}
          <span className="text-sm font-medium tabular-nums">{formatAmount(txn.amount)}</span>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-black/[.08] px-3 py-2 dark:border-white/[.12] creamsicle:border-orange-200">
          <TransactionDetail txn={txn} />

          <div className="flex flex-wrap items-end gap-1.5">
            <label className="flex flex-1 min-w-[7rem] flex-col gap-1">
              <span className="text-[11px] text-zinc-500">Category</span>
              <SearchableSelect
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setSubcategory("");
                }}
                options={categories.map((c) => ({ value: c, label: formatCategoryLabel(c) }))}
                extraOption={{ value: NEW_VALUE, label: "+ New category" }}
              />
            </label>
            {category === NEW_VALUE && (
              <label className="flex flex-1 min-w-[7rem] flex-col gap-1">
                <span className="text-[11px] text-zinc-500">New category name</span>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className={selectClasses}
                />
              </label>
            )}

            {category && (
              <label className="flex flex-1 min-w-[7rem] flex-col gap-1">
                <span className="text-[11px] text-zinc-500">Subcategory</span>
                <SearchableSelect
                  value={subcategory}
                  onChange={setSubcategory}
                  options={subcategoriesForCategory.map((s) => ({ value: s, label: formatCategoryLabel(s) }))}
                  extraOption={{ value: NEW_VALUE, label: "+ New subcategory" }}
                />
              </label>
            )}
            {subcategory === NEW_VALUE && (
              <label className="flex flex-1 min-w-[7rem] flex-col gap-1">
                <span className="text-[11px] text-zinc-500">New subcategory name</span>
                <input
                  type="text"
                  value={newSubcategory}
                  onChange={(e) => setNewSubcategory(e.target.value)}
                  className={selectClasses}
                />
              </label>
            )}

            <button
              type="button"
              onClick={handleApprove}
              disabled={!canApprove || saving}
              title="Approve"
              className="flex h-[30px] w-9 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-base font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40 dark:bg-emerald-600 dark:hover:bg-emerald-500 creamsicle:bg-orange-600 creamsicle:hover:bg-orange-700"
            >
              {saving ? "…" : "✓"}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["none", "Just this one"],
                ["name", "Always match same name"],
                ["exact", "Match exact same transactions"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRuleMode(mode)}
                className={
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors " +
                  (ruleMode === mode
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:border-orange-600 creamsicle:bg-orange-600 creamsicle:text-white"
                    : "border-black/[.12] text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50")
                }
              >
                {label}
              </button>
            ))}
          </div>
          {ruleMode === "exact" && (
            <p className="text-[11px] text-zinc-500">
              Only transactions matching the name below AND exactly {formatAmount(txn.amount)} will be included —
              e.g. a recurring payment, not a one-off charge from the same merchant.
            </p>
          )}
          {ruleMode !== "none" && (
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Text to match in future transaction descriptions"
              className={selectClasses}
            />
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
