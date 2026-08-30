"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCategoryLabel } from "@/lib/finance";
import { SearchableSelect } from "./SearchableSelect";

type CategoryOption = { category: string; subcategory: string };
type Target = { category: string; subcategory?: string };

const NEW_VALUE = "__new__";

/**
 * Inline panel for the Review sidebar's "move/delete this category" action.
 * Categories aren't rows in the DB — they're just strings on transactions
 * (see app/api/finance/categories/reassign/route.ts) — so "deleting" one
 * really means moving every transaction currently in it somewhere else.
 * With nothing left pointing at the old name, it simply stops appearing.
 */
export function CategoryReassignPanel({
  source,
  label,
  count,
  categoryOptions,
  onDone,
  onCancel,
}: {
  source: Target;
  label: string;
  count: number;
  categoryOptions: CategoryOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [sendToReview, setSendToReview] = useState(false);
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(categoryOptions.map((c) => c.category))].sort(), [categoryOptions]);
  // Every subcategory, not scoped to the currently-picked category — see the
  // same comment in TransactionReviewCard.tsx. Selecting one below
  // back-fills the correct category via handleSubcategoryChange instead of
  // requiring category-then-subcategory.
  const allSubcategories = useMemo(
    () => [...new Set(categoryOptions.map((c) => c.subcategory))].sort(),
    [categoryOptions],
  );

  function handleSubcategoryChange(v: string) {
    setSubcategory(v);
    if (v === NEW_VALUE || category === NEW_VALUE) return;
    const matches = [...new Set(categoryOptions.filter((c) => c.subcategory === v).map((c) => c.category))];
    if (matches.length === 0) return;
    if (!category || !matches.includes(category)) setCategory(matches.sort()[0]);
  }

  const resolvedCategory = category === NEW_VALUE ? newCategory.trim() : category;
  const resolvedSubcategory = subcategory === NEW_VALUE ? newSubcategory.trim() : subcategory;
  const isSameAsSource =
    resolvedCategory === source.category && (source.subcategory ? resolvedSubcategory === source.subcategory : false);
  const canConfirm = sendToReview || (resolvedCategory.length > 0 && resolvedSubcategory.length > 0 && !isSameAsSource);

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/categories/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: source,
          to: sendToReview ? null : { category: resolvedCategory, subcategory: resolvedSubcategory },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setError(errBody?.error ?? `Failed (${res.status}).`);
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectClasses =
    "rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500";

  return (
    <div className="ml-5 flex flex-col gap-2 rounded-md border border-black/[.1] p-2 text-xs dark:border-white/[.15] creamsicle:border-orange-300">
      <p className="text-zinc-500">
        Move {count} transaction{count === 1 ? "" : "s"} in <span className="font-medium">{label}</span> to:
      </p>

      {!sendToReview && (
        <div className="flex flex-col gap-1.5">
          <SearchableSelect
            value={category}
            onChange={(v) => {
              setCategory(v);
              setSubcategory("");
            }}
            options={categories.map((c) => ({ value: c, label: formatCategoryLabel(c) }))}
            extraOption={{ value: NEW_VALUE, label: "+ New category" }}
            placeholder="Category…"
          />
          {category === NEW_VALUE && (
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category name"
              className={selectClasses}
            />
          )}
          <SearchableSelect
            value={subcategory}
            onChange={handleSubcategoryChange}
            options={allSubcategories.map((s) => ({ value: s, label: formatCategoryLabel(s) }))}
            extraOption={{ value: NEW_VALUE, label: "+ New subcategory" }}
            placeholder="Subcategory…"
          />
          {subcategory === NEW_VALUE && (
            <input
              type="text"
              value={newSubcategory}
              onChange={(e) => setNewSubcategory(e.target.value)}
              placeholder="New subcategory name"
              className={selectClasses}
            />
          )}
        </div>
      )}

      <label className="flex items-center gap-1.5 text-zinc-500">
        <input type="checkbox" checked={sendToReview} onChange={(e) => setSendToReview(e.target.checked)} />
        Send back to Review instead (unclassified)
      </label>

      {isSameAsSource && !sendToReview && (
        <p className="text-amber-600 dark:text-amber-400">Pick a different destination than the source.</p>
      )}
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-1.5 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-black/[.1] px-2 py-1 text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || saving}
          className="rounded-md bg-zinc-900 px-2 py-1 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {saving ? "Moving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}
