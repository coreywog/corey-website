import type { MerchantCategoryTotal } from "@/lib/finance";
import { formatCategoryLabel } from "@/lib/finance";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function CategoryBreakdown({ totals }: { totals: MerchantCategoryTotal[] }) {
  if (totals.length === 0) {
    return <p className="text-sm text-zinc-500">No spending this month.</p>;
  }

  const max = Math.max(...totals.map((t) => t.total));

  return (
    <ul className="flex flex-col gap-2">
      {totals.map((t) => (
        <li key={t.category} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span>{formatCategoryLabel(t.category)}</span>
            <span className="font-medium">{currencyFormatter.format(t.total)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
            <div
              className="h-full rounded-full bg-rose-500"
              style={{ width: `${max > 0 ? (t.total / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
