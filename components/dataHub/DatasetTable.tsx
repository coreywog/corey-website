import type { DatasetColumn } from "@/lib/datasetCsv";

/**
 * A plain server-rendered table — no client JS, no virtualization library.
 * Row count is already bounded upstream (DATASET_ROW_DISPLAY_CAP in the
 * Data Hub page), so a few hundred rows in a real <table> is well within
 * what the browser renders instantly; reaching for a data-grid dependency
 * here would be adding weight this doesn't need.
 */
export function DatasetTable({
  columns,
  rows,
  totalCount,
  shown,
}: {
  columns: DatasetColumn[];
  rows: Record<string, string>[];
  totalCount: number;
  shown: number;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">This dataset has no rows.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {totalCount > shown && (
        <p className="text-xs text-zinc-500">
          Showing the first {shown.toLocaleString()} of {totalCount.toLocaleString()} rows.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200">
              {columns.map((c) => (
                <th
                  key={c.name}
                  className={
                    "px-3 py-2 text-left text-xs font-medium text-zinc-500 " + (c.kind === "number" ? "text-right" : "")
                  }
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-black/[.05] last:border-0 dark:border-white/[.06] creamsicle:border-orange-100"
              >
                {columns.map((c) => (
                  <td key={c.name} className={"px-3 py-1.5 " + (c.kind === "number" ? "text-right tabular-nums" : "")}>
                    {row[c.name] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
