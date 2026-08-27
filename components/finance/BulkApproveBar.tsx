"use client";

import { useState } from "react";
import type { ReviewTxn } from "./TransactionReviewCard";

/** Only a transaction the classifier actually landed on — "other" means it
 * couldn't guess, not a real suggestion, so those are never bulk-approved
 * and still need a human look one at a time. */
export function hasSuggestedCategory(t: ReviewTxn): boolean {
  return Boolean(
    t.merchantCategory && t.merchantCategory !== "other" && t.merchantSubcategory && t.merchantSubcategory !== "other",
  );
}

/**
 * The fast path for clearing a big Review queue: with two years of Plaid
 * history, hundreds of transactions can be pending at once, and most of
 * them already carry a confident guess (a learned rule, the static
 * classifier, or Plaid's own category) that's just sitting there unclicked.
 * This confirms all of the currently-visible ones with a guess in one
 * request, using whatever category is already shown — nothing still at
 * "other" is touched, so anything genuinely ambiguous is left for the
 * one-at-a-time cards below.
 */
export function BulkApproveBar({
  candidates,
  onApproved,
}: {
  candidates: ReviewTxn[];
  onApproved: (ids: string[]) => void;
}) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  async function handleClick() {
    if (
      !window.confirm(
        `Approve all ${candidates.length} transactions with a suggested category, as-is? You can still fix any of them individually afterward.`,
      )
    ) {
      return;
    }
    setApproving(true);
    setError(null);
    const ids = candidates.map((t) => t.id);
    try {
      const res = await fetch("/api/finance/transactions/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed (${res.status}).`);
        return;
      }
      onApproved(ids);
    } catch {
      setError("Network error — try again.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-500/[.06] px-3 py-2 dark:border-emerald-400/30 creamsicle:border-orange-300 creamsicle:bg-orange-50">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {candidates.length} already {candidates.length === 1 ? "has" : "have"} a suggested category.
      </span>
      <button
        type="button"
        onClick={handleClick}
        disabled={approving}
        className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 dark:hover:bg-emerald-500 creamsicle:bg-orange-600 creamsicle:hover:bg-orange-700"
      >
        {approving ? "Approving…" : `Approve all ${candidates.length}`}
      </button>
      {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
