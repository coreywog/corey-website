"use client";

import { useState } from "react";
import type { BarDatum } from "./SpendingBarChart";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Sortable (largest/smallest first), clickable list of category/subcategory/merchant totals. Clicking the already-selected row deselects it. */
export function SpendingList({
  items,
  selectedKey,
  onSelect,
}: {
  items: BarDatum[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No spending in this range.</p>;
  }

  const sorted = [...items].sort((a, b) => (sortDir === "desc" ? b.total - a.total : a.total - b.total));

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
        className="self-start text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        Sort: {sortDir === "desc" ? "Largest first ↓" : "Smallest first ↑"}
      </button>
      <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
        {sorted.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item.key)}
              className={
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                (selectedKey === item.key
                  ? "bg-black/[.06] dark:bg-white/[.1] creamsicle:bg-orange-100"
                  : "hover:bg-black/[.03] dark:hover:bg-white/[.05] creamsicle:hover:bg-orange-50")
              }
            >
              <span className="flex items-center gap-2 truncate">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 font-medium">{currencyFormatter.format(item.total)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
