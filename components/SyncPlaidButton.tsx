"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = { type: "success" | "error"; message: string } | null;

/** Manual "Sync now" — same /transactions/sync path the webhook uses, just triggered on demand. */
export function SyncPlaidButton({ plaidItemId }: { plaidItemId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidItemId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatus({ type: "error", message: body?.error ?? `Sync failed (${res.status}).` });
        return;
      }
      const body = await res.json();
      const r = body.results?.[0];
      setStatus({
        type: "success",
        message: r ? `+${r.added} / ~${r.modified} / -${r.removed}` : "Synced.",
      });
      router.refresh();
    } catch {
      setStatus({ type: "error", message: "Network error." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md border border-black/[.1] px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
      >
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {status && (
        <span className={status.type === "success" ? "text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-red-600 dark:text-red-400"}>
          {status.message}
        </span>
      )}
    </div>
  );
}
