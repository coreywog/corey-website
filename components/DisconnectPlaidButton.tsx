"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fully unlinks a Plaid Item and deletes everything it synced — see
 * app/api/plaid/items/[id]/route.ts. No undo, so this confirms twice: once
 * with the institution's name (window.confirm), and the button itself only
 * appears in Settings, not somewhere easy to hit by accident.
 */
export function DisconnectPlaidButton({ plaidItemId, institutionName }: { plaidItemId: string; institutionName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm(`Disconnect ${institutionName} and delete everything it synced? This can't be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/plaid/items/${plaidItemId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to disconnect (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-md border border-black/[.1] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-white/[.15] dark:text-red-400 dark:hover:bg-red-950/30"
      >
        {busy ? "Disconnecting…" : "Disconnect"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
