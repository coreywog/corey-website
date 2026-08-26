"use client";

import { useState } from "react";
import { TransactionReviewCard, type ReviewTxn } from "./TransactionReviewCard";

type CategoryOption = { category: string; subcategory: string };

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

  function handleApproved(id: string) {
    const txn = remaining.find((t) => t.id === id);
    setRemaining((prev) => prev.filter((t) => t.id !== id));
    if (txn) setJustApproved((prev) => [{ ...txn, reviewed: true }, ...prev]);
  }

  const tabButtonClasses = (active: boolean) =>
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
    (active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
      : "text-zinc-500 hover:bg-black/[.05] dark:text-zinc-400 dark:hover:bg-white/[.08] creamsicle:text-orange-600 creamsicle:hover:bg-orange-50");

  const approvedList = [...justApproved, ...approved];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab("needs-review")} className={tabButtonClasses(tab === "needs-review")}>
          Needs review {remaining.length > 0 && `(${remaining.length})`}
        </button>
        <button type="button" onClick={() => setTab("approved")} className={tabButtonClasses(tab === "approved")}>
          Approved {approvedList.length > 0 && `(${approvedList.length})`}
        </button>
      </div>

      {tab === "needs-review" &&
        (remaining.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing left to review in this category 🎉</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {remaining.map((t) => (
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
        (approvedList.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing approved in this category yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {approvedList.map((t) => (
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
