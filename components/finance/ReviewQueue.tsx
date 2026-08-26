"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PendingTxn = {
  id: string;
  date: string;
  account: string;
  description: string;
  amount: number;
  rawName: string | null;
  location: string | null;
  paymentChannel: string | null;
  plaidDetailedCategory: string | null;
};
type CategoryOption = { category: string; subcategory: string };
type Rule = { id: string; pattern: string; merchantCategory: string; merchantSubcategory: string };

const NEW_VALUE = "__new__";

function formatAmount(amount: number) {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

// "FOOD_AND_DRINK_COFFEE" -> "Food and drink · Coffee"
function formatPlaidCategory(detailed: string): string {
  const words = detailed.toLowerCase().split("_");
  // Plaid's detailed categories are "<primary words>_<specific words>" with
  // no fixed split point — primary is usually 2-3 words. Good enough as a
  // rough "broad · specific" split without needing Plaid's full taxonomy.
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

function ReviewRow({
  txn,
  categoryOptions,
  onApplied,
}: {
  txn: PendingTxn;
  categoryOptions: CategoryOption[];
  onApplied: (pattern: string, count: number, category: string, subcategory: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [pattern, setPattern] = useState(txn.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const canSave = resolvedCategory.length > 0 && resolvedSubcategory.length > 0 && pattern.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern: pattern.trim(),
          merchantCategory: resolvedCategory,
          merchantSubcategory: resolvedSubcategory,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to save (${res.status}).`);
        return;
      }
      const body = await res.json();
      onApplied(pattern.trim(), body.appliedCount ?? 1, resolvedCategory, resolvedSubcategory);
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-black/[.08] dark:border-white/[.1]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="w-20 shrink-0 text-xs text-zinc-500">{txn.date}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{txn.description}</span>
          <span className="shrink-0 text-xs text-zinc-400">{txn.account}</span>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums">{formatAmount(txn.amount)}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-black/[.06] p-3 dark:border-white/[.08]">
          <div className="flex flex-col gap-1 rounded-md bg-black/[.02] px-3 py-2 text-sm dark:bg-white/[.03]">
            <div className="font-medium">{txn.description}</div>
            {txn.rawName && (
              <div className="text-xs text-zinc-500">
                Raw from bank: <span className="font-mono">{txn.rawName}</span>
              </div>
            )}
            {(txn.location || txn.paymentChannel) && (
              <div className="text-xs text-zinc-500">
                {[txn.location, txn.paymentChannel ? formatPaymentChannel(txn.paymentChannel) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {txn.plaidDetailedCategory && (
              <div className="text-xs text-zinc-500">
                Plaid suggests: {formatPlaidCategory(txn.plaidDetailedCategory)}
              </div>
            )}
            {!txn.rawName && !txn.location && !txn.plaidDetailedCategory && (
              <div className="text-xs text-zinc-500">
                No further detail available — this was imported from a bank statement, not live-synced.
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
              <span className="text-xs text-zinc-500">Category</span>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setSubcategory("");
                }}
                className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
              >
                <option value="" disabled>
                  Select…
                </option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={NEW_VALUE}>+ New category</option>
              </select>
            </label>
            {category === NEW_VALUE && (
              <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                <span className="text-xs text-zinc-500">New category name</span>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                />
              </label>
            )}
          </div>

          {category && (
            <div className="flex flex-wrap gap-2">
              <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                <span className="text-xs text-zinc-500">Subcategory</span>
                <select
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {subcategoriesForCategory.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value={NEW_VALUE}>+ New subcategory</option>
                </select>
              </label>
              {subcategory === NEW_VALUE && (
                <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                  <span className="text-xs text-zinc-500">New subcategory name</span>
                  <input
                    type="text"
                    value={newSubcategory}
                    onChange={(e) => setNewSubcategory(e.target.value)}
                    className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                  />
                </label>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-zinc-500">
              Match merchants containing — applies to every past and future transaction with this text
            </span>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
            />
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving…" : "Save & apply"}
          </button>
        </div>
      )}
    </div>
  );
}

export function ReviewQueue({
  transactions,
  categoryOptions,
  rules,
}: {
  transactions: PendingTxn[];
  categoryOptions: CategoryOption[];
  rules: Rule[];
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(transactions);
  const [options, setOptions] = useState(categoryOptions);
  const [ruleList, setRuleList] = useState(rules);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleApplied(pattern: string, count: number, category: string, subcategory: string) {
    const lower = pattern.toLowerCase();
    setRemaining((prev) => prev.filter((t) => !t.description.toLowerCase().includes(lower)));
    setLastResult(`Applied to ${count} transaction${count === 1 ? "" : "s"}.`);
    // So a brand-new category/subcategory shows up as a pickable option for
    // the rest of the queue without waiting on a full page refresh.
    setOptions((prev) =>
      prev.some((o) => o.category === category && o.subcategory === subcategory)
        ? prev
        : [...prev, { category, subcategory }],
    );
    router.refresh(); // re-syncs the underlying data (e.g. Overview/Daily tabs) in the background
  }

  async function handleDeleteRule(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/finance/rules/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRuleList((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
            Needs a category — {remaining.length} left
          </h2>
          {lastResult && <span className="text-xs text-emerald-600 dark:text-emerald-400">{lastResult}</span>}
        </div>
        {remaining.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing left to review 🎉</p>
        ) : (
          <div className="flex flex-col gap-2">
            {remaining.map((t) => (
              <ReviewRow key={t.id} txn={t} categoryOptions={options} onApplied={handleApplied} />
            ))}
          </div>
        )}
      </div>

      {ruleList.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
            Saved rules ({ruleList.length})
          </h2>
          <div className="flex flex-col gap-1.5">
            {ruleList.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-md border border-black/[.06] px-3 py-2 text-sm dark:border-white/[.08]"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-zinc-500">contains</span> &ldquo;{r.pattern}&rdquo;{" "}
                  <span className="text-zinc-500">→</span> {r.merchantCategory} / {r.merchantSubcategory}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(r.id)}
                  disabled={deletingId === r.id}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
                >
                  {deletingId === r.id ? "Removing…" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
