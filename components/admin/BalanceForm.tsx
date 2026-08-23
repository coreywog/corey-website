"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Account = {
  id: string;
  name: string;
  type: string;
  kind: string;
};

const NEW_ACCOUNT_VALUE = "__new__";
const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "investment",
  "credit",
  "loan",
  "other",
] as const;
const ACCOUNT_KINDS = ["asset", "liability"] as const;

type EntryRow = {
  key: string;
  accountId: string;
  newAccountName: string;
  newAccountType: (typeof ACCOUNT_TYPES)[number];
  newAccountKind: (typeof ACCOUNT_KINDS)[number];
  balance: string;
};

function emptyRow(key: string): EntryRow {
  return {
    key,
    accountId: "",
    newAccountName: "",
    newAccountType: "checking",
    newAccountKind: "asset",
    balance: "",
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function BalanceForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [date, setDate] = useState(todayIsoDate());
  const [rows, setRows] = useState<EntryRow[]>([emptyRow("0")]);
  const [nextKey, setNextKey] = useState(1);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(key: string, patch: Partial<EntryRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(String(nextKey))]);
    setNextKey((n) => n + 1);
  }

  function removeRow(key: string) {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((row) => row.key !== key) : prev,
    );
  }

  function resetForm() {
    setDate(todayIsoDate());
    setRows([emptyRow(String(nextKey))]);
    setNextKey((n) => n + 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const entries = [];
    for (const row of rows) {
      const balance = Number(row.balance);
      if (!row.accountId) {
        setStatus({ type: "error", message: "Pick an account for every entry." });
        return;
      }
      if (!Number.isFinite(balance)) {
        setStatus({ type: "error", message: "Balance is required for every entry." });
        return;
      }

      const entry: Record<string, unknown> = { balance };

      if (row.accountId === NEW_ACCOUNT_VALUE) {
        if (!row.newAccountName.trim()) {
          setStatus({ type: "error", message: "Name the new account." });
          return;
        }
        entry.newAccount = {
          name: row.newAccountName.trim(),
          type: row.newAccountType,
          kind: row.newAccountKind,
        };
      } else {
        entry.accountId = row.accountId;
      }

      entries.push(entry);
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, entries }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatus({
          type: "error",
          message: body?.error ?? `Failed to save (${res.status}).`,
        });
        return;
      }

      setStatus({
        type: "success",
        message: `Saved ${entries.length} balance${entries.length === 1 ? "" : "s"}.`,
      });
      resetForm();
      router.refresh();
    } catch {
      setStatus({ type: "error", message: "Network error — try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <label className="flex max-w-[10rem] flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
      </label>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Balances
        </span>
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-md border border-black/[.08] p-3 dark:border-white/[.1]"
          >
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                <span className="text-xs text-zinc-500">Account</span>
                <select
                  value={row.accountId}
                  onChange={(e) =>
                    updateRow(row.key, { accountId: e.target.value })
                  }
                  required
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {accounts.map((acct) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.name}
                    </option>
                  ))}
                  <option value={NEW_ACCOUNT_VALUE}>+ Add new account</option>
                </select>
              </label>
              <label className="flex w-28 flex-col gap-1.5">
                <span className="text-xs text-zinc-500">Balance</span>
                <input
                  type="number"
                  step="0.01"
                  value={row.balance}
                  onChange={(e) =>
                    updateRow(row.key, { balance: e.target.value })
                  }
                  required
                  className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                />
              </label>
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                className="rounded-md px-2 py-2 text-sm text-zinc-500 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
                aria-label="Remove entry"
              >
                ✕
              </button>
            </div>
            {row.accountId === NEW_ACCOUNT_VALUE && (
              <div className="flex flex-wrap items-end gap-2 border-t border-black/[.06] pt-2 dark:border-white/[.08]">
                <label className="flex flex-1 min-w-[9rem] flex-col gap-1.5">
                  <span className="text-xs text-zinc-500">New account name</span>
                  <input
                    type="text"
                    value={row.newAccountName}
                    onChange={(e) =>
                      updateRow(row.key, { newAccountName: e.target.value })
                    }
                    required
                    className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-zinc-500">Type</span>
                  <select
                    value={row.newAccountType}
                    onChange={(e) =>
                      updateRow(row.key, {
                        newAccountType: e.target
                          .value as EntryRow["newAccountType"],
                      })
                    }
                    className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-zinc-500">Kind</span>
                  <select
                    value={row.newAccountKind}
                    onChange={(e) =>
                      updateRow(row.key, {
                        newAccountKind: e.target
                          .value as EntryRow["newAccountKind"],
                      })
                    }
                    className="rounded-md border border-black/[.1] bg-white px-2 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                  >
                    {ACCOUNT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="self-start rounded-md border border-black/[.1] px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-black/[.03] dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
        >
          + Add balance
        </button>
      </div>

      {status && (
        <p
          className={
            status.type === "success"
              ? "text-sm text-emerald-600 dark:text-emerald-400"
              : "text-sm text-red-600 dark:text-red-400"
          }
        >
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {submitting ? "Saving…" : "Save balances"}
      </button>
    </form>
  );
}
