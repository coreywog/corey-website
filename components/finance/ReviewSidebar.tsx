"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { formatCategoryLabel } from "@/lib/finance";
import type { ReviewCategoryNode } from "@/lib/finance";
import { CategoryReassignPanel } from "./CategoryReassignPanel";

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function ReviewSidebar({
  tree,
  globalNeedsReview,
}: {
  tree: ReviewCategoryNode[];
  globalNeedsReview: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCategory = searchParams.get("category");
  const selectedSubcategory = searchParams.get("subcategory");

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selectedCategory ? [selectedCategory] : []),
  );
  // Which node's "move/delete" panel is currently open — null means none.
  // Keyed as "category" or "category::subcategory" rather than an object so
  // a plain string equality check is enough.
  const [managingKey, setManagingKey] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () => tree.flatMap((node) => node.subcategories.map((s) => ({ category: node.category, subcategory: s.subcategory }))),
    [tree],
  );

  function toggle(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const isGlobal = !selectedCategory;
  // `grow` param: true for category/subcategory rows, which sit alongside
  // an expand/collapse button in a horizontal flex row and need flex-1 to
  // fill the remaining width there. The standalone top-level "Needs review"
  // link is a direct child of the outer flex-col nav instead — flex-1
  // there would grow it to fill all remaining *vertical* space, not what
  // we want.
  const linkClasses = (active: boolean, grow: boolean) =>
    `flex ${grow ? "flex-1" : "w-full"} items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-sm transition-colors ` +
    (active
      ? "bg-black/[.05] font-medium text-zinc-900 dark:bg-white/[.08] dark:text-zinc-50 creamsicle:bg-orange-100 creamsicle:text-orange-900"
      : "text-zinc-600 hover:bg-black/[.03] dark:text-zinc-400 dark:hover:bg-white/[.05] creamsicle:text-orange-700 creamsicle:hover:bg-orange-50");

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-black/[.08] px-2 py-4 dark:border-white/[.1] creamsicle:border-orange-200">
      <Link href={pathname} className={linkClasses(isGlobal, false)}>
        Needs review
        <Badge count={globalNeedsReview} />
      </Link>

      <div className="my-2 border-t border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200" />

      <div className="flex flex-col gap-0.5">
        {tree.map((node) => {
          const isExpanded = expanded.has(node.category) || selectedCategory === node.category;
          const isCategoryActive = selectedCategory === node.category && !selectedSubcategory;
          const categoryKey = node.category;
          const categoryTotal = node.needsReview + node.approved;
          return (
            <div key={node.category}>
              <div className="group flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toggle(node.category)}
                  className="flex h-6 w-5 shrink-0 items-center justify-center text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? "▾" : "▸"}
                </button>
                <Link
                  href={isCategoryActive ? pathname : `${pathname}?category=${node.category}`}
                  className={linkClasses(isCategoryActive, true)}
                >
                  {formatCategoryLabel(node.category)}
                  <Badge count={node.needsReview} />
                </Link>
                <button
                  type="button"
                  onClick={() => setManagingKey((prev) => (prev === categoryKey ? null : categoryKey))}
                  title="Move or delete this category"
                  className="shrink-0 rounded px-1 text-xs text-zinc-400 opacity-0 hover:bg-black/[.06] hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-white/[.1] dark:hover:text-zinc-200"
                >
                  ⋯
                </button>
              </div>
              {managingKey === categoryKey && (
                <CategoryReassignPanel
                  source={{ category: node.category }}
                  label={formatCategoryLabel(node.category)}
                  count={categoryTotal}
                  categoryOptions={categoryOptions.filter((c) => c.category !== node.category)}
                  onDone={() => setManagingKey(null)}
                  onCancel={() => setManagingKey(null)}
                />
              )}
              {isExpanded && (
                <div className="ml-5 flex flex-col gap-0.5">
                  {node.subcategories.map((sub) => {
                    const isSubActive =
                      selectedCategory === node.category && selectedSubcategory === sub.subcategory;
                    const subKey = `${node.category}::${sub.subcategory}`;
                    const subTotal = sub.needsReview + sub.approved;
                    return (
                      <div key={sub.subcategory}>
                        <div className="group flex items-center gap-0.5">
                          <Link
                            href={
                              isSubActive
                                ? `${pathname}?category=${node.category}`
                                : `${pathname}?category=${node.category}&subcategory=${sub.subcategory}`
                            }
                            className={linkClasses(isSubActive, true)}
                          >
                            {formatCategoryLabel(sub.subcategory)}
                            <Badge count={sub.needsReview} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setManagingKey((prev) => (prev === subKey ? null : subKey))}
                            title="Move or delete this subcategory"
                            className="shrink-0 rounded px-1 text-xs text-zinc-400 opacity-0 hover:bg-black/[.06] hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-white/[.1] dark:hover:text-zinc-200"
                          >
                            ⋯
                          </button>
                        </div>
                        {managingKey === subKey && (
                          <CategoryReassignPanel
                            source={{ category: node.category, subcategory: sub.subcategory }}
                            label={`${formatCategoryLabel(node.category)} / ${formatCategoryLabel(sub.subcategory)}`}
                            count={subTotal}
                            categoryOptions={categoryOptions.filter(
                              (c) => !(c.category === node.category && c.subcategory === sub.subcategory),
                            )}
                            onDone={() => setManagingKey(null)}
                            onCancel={() => setManagingKey(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
