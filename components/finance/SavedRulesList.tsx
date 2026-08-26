"use client";

import { useState } from "react";

type Rule = { id: string; pattern: string; merchantCategory: string; merchantSubcategory: string };

export function SavedRulesList({ rules }: { rules: Rule[] }) {
  const [ruleList, setRuleList] = useState(rules);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/finance/rules/${id}`, { method: "DELETE" });
      if (res.ok) setRuleList((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  if (ruleList.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
        Saved rules ({ruleList.length})
      </h2>
      <div className="flex flex-col gap-1.5">
        {ruleList.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-md border border-black/[.06] px-3 py-2 text-sm dark:border-white/[.08] creamsicle:border-orange-100"
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="text-zinc-500">contains</span> &ldquo;{r.pattern}&rdquo;{" "}
              <span className="text-zinc-500">→</span> {r.merchantCategory} / {r.merchantSubcategory}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(r.id)}
              disabled={deletingId === r.id}
              className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
            >
              {deletingId === r.id ? "Removing…" : "Remove"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
