"use client";

import { useMemo, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { TransactionReviewCard, type ReviewTxn } from "./TransactionReviewCard";

type CategoryOption = { category: string; subcategory: string };

function matches(t: ReviewTxn, q: string): boolean {
  return (
    t.description.toLowerCase().includes(q) ||
    Boolean(t.rawName?.toLowerCase().includes(q)) ||
    t.account.toLowerCase().includes(q) ||
    Boolean(t.merchantCategory && formatCategoryLabel(t.merchantCategory).toLowerCase().includes(q)) ||
    Boolean(t.merchantSubcategory && formatCategoryLabel(t.merchantSubcategory).toLowerCase().includes(q))
  );
}

export function GlobalReviewList({
  transactions,
  categoryOptions,
}: {
  transactions: ReviewTxn[];
  categoryOptions: CategoryOption[];
}) {
  const [remaining, setRemaining] = useState(transactions);
  const [search, setSearch] = useState("");

  function handleApproved(id: string, rulePattern?: string) {
    setRemaining((prev) =>
      prev.filter((t) => !(t.id === id || (rulePattern && t.description.toLowerCase().includes(rulePattern)))),
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter((t) => matches(t, q));
  }, [remaining, search]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search transactions, categories…"
        className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500"
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {remaining.length === 0 ? "Nothing left to review 🎉" : "No matches."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtered.map((t) => (
            <TransactionReviewCard
              key={t.id}
              txn={t}
              categoryOptions={categoryOptions}
              defaultOpen
              onApproved={handleApproved}
            />
          ))}
        </div>
      )}
    </div>
  );
}
