import { formatCategoryLabel } from "@/lib/finance";
import type { ReviewTxn } from "./TransactionReviewCard";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A plain, capped, read-only look at the raw transaction rows underneath
 * the review workflow — "I just want to see the data," not a second review
 * UI. `<details open>` rather than a client-side collapse: costs no JS and
 * still lets it be tucked away later without losing the "show it
 * immediately" default. Deliberately not editable and not extended with
 * computed columns/type-changing the way Data Management's CSV datasets
 * are — Transaction already has fixed, purpose-built fields, so an
 * open-ended column system doesn't apply here the same way.
 */
export function RawTransactionTable({ transactions }: { transactions: ReviewTxn[] }) {
  if (transactions.length === 0) {
    return null;
  }

  return (
    <details open className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1] creamsicle:border-orange-200">
      <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300 creamsicle:text-orange-900">
        Raw data preview — {transactions.length} most recent transactions
      </summary>
      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200">
              {["Date", "Account", "Description", "Category", "Subcategory", "Amount"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b border-black/[.05] last:border-0 dark:border-white/[.06] creamsicle:border-orange-100">
                <td className="px-3 py-1.5">{formatDate(t.date)}</td>
                <td className="px-3 py-1.5">{t.account}</td>
                <td className="max-w-xs truncate px-3 py-1.5" title={t.description}>
                  {t.description}
                </td>
                <td className="px-3 py-1.5">{t.merchantCategory ? formatCategoryLabel(t.merchantCategory) : ""}</td>
                <td className="px-3 py-1.5">{t.merchantSubcategory ? formatCategoryLabel(t.merchantSubcategory) : ""}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{currencyFormatter.format(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
