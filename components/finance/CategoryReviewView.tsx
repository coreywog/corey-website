"use client";

import { useMemo, useState } from "react";
import { formatCategoryLabel } from "@/lib/finance";
import { TransactionReviewCard, type ReviewTxn } from "./TransactionReviewCard";
import { BulkApproveBar, hasSuggestedCategory } from "./BulkApproveBar";

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

function ruleSweepMatches(t: ReviewTxn, sweep: { pattern: string; exactAmount: number | null }): boolean {
  if (!t.description.toLowerCase().includes(sweep.pattern)) return false;
  if (sweep.exactAmount !== null && Math.round(Math.abs(t.amount) * 100) !== Math.round(sweep.exactAmount * 100)) {
    return false;
  }
  return true;
}

export function CategoryReviewView({
  needsReview,
  approved,
  categoryOptions,
}: {
  needsReview: ReviewTxn[];
  approved: ReviewTxn[];
  categoryOptions: CategoryOption[];
}) {
  const [tab, setTab] = useState<"needs-review" | "approved">(needsReview.length > 0 ? "needs-review" : "approved");
  const [remaining, setRemaining] = useState(needsReview);
  const [justApproved, setJustApproved] = useState<ReviewTxn[]>([]);
  const [search, setSearch] = useState("");

  function handleApproved(id: string, sweep?: { pattern: string; exactAmount: number | null }) {
    const toMove = remaining.filter((t) => t.id === id || (sweep && ruleSweepMatches(t, sweep)));
    if (toMove.length === 0) return;
    const movedIds = new Set(toMove.map((t) => t.id));
    setRemaining((prev) => prev.filter((t) => !movedIds.has(t.id)));
    setJustApproved((prev) => [...toMove.map((t) => ({ ...t, reviewed: true })), ...prev]);
  }

  function handleBulkApproved(ids: string[]) {
    const idSet = new Set(ids);
    const toMove = remaining.filter((t) => idSet.has(t.id));
    setRemaining((prev) => prev.filter((t) => !idSet.has(t.id)));
    setJustApproved((prev) => [...toMove.map((t) => ({ ...t, reviewed: true })), ...prev]);
  }

  const tabButtonClasses = (active: boolean) =>
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
    (active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
      : "text-zinc-500 hover:bg-black/[.05] dark:text-zinc-400 dark:hover:bg-white/[.08] creamsicle:text-orange-600 creamsicle:hover:bg-orange-50");

  const approvedList = [...justApproved, ...approved];
  const q = search.trim().toLowerCase();
  const filteredRemaining = q ? remaining.filter((t) => matches(t, q)) : remaining;
  const filteredApproved = q ? approvedList.filter((t) => matches(t, q)) : approvedList;
  const withGuess = useMemo(() => filteredRemaining.filter(hasSuggestedCategory), [filteredRemaining]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("needs-review")}
            className={tabButtonClasses(tab === "needs-review")}
          >
            Needs review {remaining.length > 0 && `(${remaining.length})`}
          </button>
          <button type="button" onClick={() => setTab("approved")} className={tabButtonClasses(tab === "approved")}>
            Approved {approvedList.length > 0 && `(${approvedList.length})`}
          </button>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions, categories…"
          className="min-w-[10rem] flex-1 rounded-md border border-black/[.1] bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500"
        />
      </div>

      {tab === "needs-review" && <BulkApproveBar candidates={withGuess} onApproved={handleBulkApproved} />}

      {tab === "needs-review" &&
        (filteredRemaining.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {remaining.length === 0 ? "Nothing left to review in this category 🎉" : "No matches."}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredRemaining.map((t) => (
              <TransactionReviewCard
                key={t.id}
                txn={t}
                categoryOptions={categoryOptions}
                defaultOpen
                onApproved={handleApproved}
              />
            ))}
          </div>
        ))}

      {tab === "approved" &&
        (filteredApproved.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {approvedList.length === 0 ? "Nothing approved in this category yet." : "No matches."}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredApproved.map((t) => (
              <TransactionReviewCard
                key={t.id}
                txn={t}
                categoryOptions={categoryOptions}
                defaultOpen={false}
                onApproved={() => {}}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
