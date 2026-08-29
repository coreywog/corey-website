"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DatasetColumn, ColumnKind } from "@/lib/datasetCsv";
import type { DatasetComputedColumn } from "@/lib/datasetFormula";
import { ScrollableTable } from "@/components/ui/ScrollableTable";

const COLUMN_KINDS: { value: ColumnKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

const inputClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";

/**
 * The Data Management dataset preview, upgraded from a plain read-only
 * table (DatasetTable) into something you can actually reshape: re-type a
 * column that got inferred wrong at upload, and build new columns as a
 * formula over the raw ones ("[Price] * [Quantity]") — see
 * lib/datasetFormula.ts for the (deliberately small, non-eval) expression
 * language. Every row's raw values and every computed column's already-
 * evaluated result arrive pre-rendered as display strings from the server
 * (app/(site)/data-hub/page.tsx) — this component only owns the editing
 * UI, then round-trips through a PATCH + router.refresh() rather than
 * trying to keep a second copy of "what the table currently shows" in
 * sync with the server on its own.
 */
export function DatasetTableEditor({
  datasetId,
  columns,
  computedColumns,
  rows,
  totalCount,
  shown,
}: {
  datasetId: string;
  columns: DatasetColumn[];
  computedColumns: DatasetComputedColumn[];
  rows: Record<string, string>[];
  totalCount: number;
  shown: number;
}) {
  const router = useRouter();
  const [savingKind, setSavingKind] = useState<string | null>(null);
  const [addingComputed, setAddingComputed] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormula, setNewFormula] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingName, setRemovingName] = useState<string | null>(null);

  async function patchDataset(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(`/api/data-hub/datasets/${datasetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setError(errBody?.error ?? `Failed to update (${res.status}).`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error — try again.");
      return false;
    }
  }

  async function handleKindChange(name: string, kind: ColumnKind) {
    setSavingKind(name);
    await patchDataset({ columnKinds: { [name]: kind } });
    setSavingKind(null);
  }

  async function handleAddComputed() {
    const name = newName.trim();
    const formula = newFormula.trim();
    if (!name || !formula) return;
    setSaving(true);
    const ok = await patchDataset({ computedColumns: [...computedColumns, { name, formula }] });
    setSaving(false);
    if (ok) {
      setNewName("");
      setNewFormula("");
      setAddingComputed(false);
    }
  }

  async function handleRemoveComputed(name: string) {
    if (!window.confirm(`Remove the computed column "${name}"?`)) return;
    setRemovingName(name);
    await patchDataset({ computedColumns: computedColumns.filter((c) => c.name !== name) });
    setRemovingName(null);
  }

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
      <div className="overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200">
        <ScrollableTable>
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200">
              {columns.map((c) => (
                <th key={c.name} className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                  <div className="flex flex-col gap-1">
                    <span>{c.name}</span>
                    <select
                      value={c.kind}
                      disabled={savingKind === c.name}
                      onChange={(e) => handleKindChange(c.name, e.target.value as ColumnKind)}
                      className="rounded border border-black/[.1] bg-transparent px-1 py-0.5 text-[11px] font-normal text-zinc-500 outline-none dark:border-white/[.15]"
                    >
                      {COLUMN_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              ))}
              {computedColumns.map((cc) => (
                <th key={cc.name} className="px-3 py-2 text-right text-xs font-medium text-zinc-500">
                  <div className="flex flex-col gap-1 items-end">
                    <span className="flex items-center gap-1">
                      {cc.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveComputed(cc.name)}
                        disabled={removingName === cc.name}
                        title={`Remove ${cc.name}`}
                        aria-label={`Remove ${cc.name}`}
                        className="text-zinc-400 hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400"
                      >
                        {removingName === cc.name ? "…" : "✕"}
                      </button>
                    </span>
                    <span className="font-mono text-[10px] font-normal text-zinc-400" title={cc.formula}>
                      {cc.formula.length > 20 ? `${cc.formula.slice(0, 20)}…` : cc.formula}
                    </span>
                  </div>
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
                {computedColumns.map((cc) => (
                  <td key={cc.name} className="px-3 py-1.5 text-right tabular-nums">
                    {row[cc.name] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollableTable>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {addingComputed ? (
        <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] p-3 dark:border-white/[.1]">
          <span className="text-xs text-zinc-500">
            New computed column — reference a raw column by name in brackets, e.g. [Price] * [Quantity]. Supports
            + − × ÷, parentheses, and ABS()/ROUND().
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Column name"
              maxLength={60}
              className={inputClasses + " w-40"}
            />
            <input
              type="text"
              value={newFormula}
              onChange={(e) => setNewFormula(e.target.value)}
              placeholder="[Price] * [Quantity]"
              className={inputClasses + " min-w-[16rem] flex-1 font-mono"}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {columns.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setNewFormula((prev) => `${prev}[${c.name}]`)}
                className="rounded-full border border-black/[.12] px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
              >
                + {c.name}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAddingComputed(false);
                setError(null);
                setNewName("");
                setNewFormula("");
              }}
              className="rounded-md border border-black/[.1] px-3 py-1.5 text-sm text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddComputed}
              disabled={!newName.trim() || !newFormula.trim() || saving}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
            >
              {saving ? "Saving…" : "Add column"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingComputed(true)}
          className="self-start rounded-full border border-black/[.12] px-3 py-1 text-xs font-medium text-zinc-500 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
        >
          + Add computed column
        </button>
      )}
    </div>
  );
}
