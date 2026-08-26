"use client";

import { useState } from "react";
import { TransactionReviewCard, type ReviewTxn } from "./TransactionReviewCard";

type CategoryOption = { category: string; subcategory: string };

export function GlobalReviewList({
  transactions,
  categoryOptions,
}: {
  transactions: ReviewTxn[];
  categoryOptions: CategoryOption[];
}) {
  const [remaining, setRemaining] = useState(transactions);

  function handleApproved(id: string) {
    setRemaining((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
        Needs a category — {remaining.length} left
      </h2>
      {remaining.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing left to review 🎉</p>
      ) : (
        <div className="flex flex-col gap-2">
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
      )}
    </div>
  );
}
