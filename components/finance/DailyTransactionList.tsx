"use client";

import { TransactionReviewCard, type ReviewTxn } from "./TransactionReviewCard";

type CategoryOption = { category: string; subcategory: string };

// Non-spending rows (income/transfer/other) don't have a merchant category
// to approve — categorization only applies to real spending (see
// lib/merchantClassify.ts's own gating) — so they render as a plain row,
// same as before this component existed.
type PlainTxn = { id: string; account: string; category: string; description: string; amount: number };

function formatAmount(amount: number) {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function PlainRow({ txn }: { txn: PlainTxn }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-black/[.06] px-3 py-2.5 dark:border-white/[.08]">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">{txn.description}</span>
        <span className="shrink-0 text-xs text-zinc-400">{txn.category}</span>
        <span className="shrink-0 text-xs text-zinc-400">{txn.account}</span>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">{formatAmount(txn.amount)}</span>
    </div>
  );
}

/**
 * One day's transactions (app/(site)/finance/daily) — spending rows get the
 * same rich detail + inline categorize card as the Transaction Detail tab
 * (TransactionReviewCard), so a merchant can be fixed the moment it's
 * noticed instead of waiting for a separate review pass. Income/transfer/
 * other rows stay plain, unreviewable rows — matches what this list looked
 * like before categorization existed here.
 */
export function DailyTransactionList({
  transactions,
  categoryOptions,
}: {
  transactions: (ReviewTxn | PlainTxn)[];
  categoryOptions: CategoryOption[];
}) {
  function handleApproved() {
    // Nothing to remove from view here (unlike the Review queue) — the card
    // itself flips to its own "approved" checkmark state, and
    // TransactionReviewCard's own router.refresh() keeps the rest of the
    // page's data current.
  }

  return (
    <div className="flex flex-col gap-1.5">
      {transactions.map((t) =>
        "reviewed" in t ? (
          <TransactionReviewCard
            key={t.id}
            txn={t}
            categoryOptions={categoryOptions}
            defaultOpen={!t.reviewed}
            onApproved={handleApproved}
          />
        ) : (
          <PlainRow key={t.id} txn={t} />
        ),
      )}
    </div>
  );
}
