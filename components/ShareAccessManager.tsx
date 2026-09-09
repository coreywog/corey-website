"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Settings' "Shared dashboards" section — grant/revoke another account's
 * read/view access to *all* of your own dashboards (see AccountShare's
 * schema comment: whole-account, not per-dashboard; view-only, never
 * edit). `otherAccounts` is every login account except the current one —
 * this app has no self-serve signup, so the list is small and fixed.
 */
export function ShareAccessManager({
  otherAccounts,
  initialGrantedTo,
  receivedFrom,
}: {
  otherAccounts: string[];
  initialGrantedTo: string[];
  receivedFrom: string[];
}) {
  const router = useRouter();
  const [grantedTo, setGrantedTo] = useState(new Set(initialGrantedTo));
  const [busyUsername, setBusyUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(otherUsername: string) {
    setError(null);
    setBusyUsername(otherUsername);
    const currentlyShared = grantedTo.has(otherUsername);
    try {
      const res = currentlyShared
        ? await fetch(`/api/settings/shares/${otherUsername}`, { method: "DELETE" })
        : await fetch("/api/settings/shares", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ viewerUsername: otherUsername }),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Failed to update sharing.");
        return;
      }
      setGrantedTo((prev) => {
        const next = new Set(prev);
        if (currentlyShared) next.delete(otherUsername);
        else next.add(otherUsername);
        return next;
      });
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusyUsername(null);
    }
  }

  if (otherAccounts.length === 0 && receivedFrom.length === 0) {
    return <p className="text-sm text-zinc-500">No other accounts exist yet to share with.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {otherAccounts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {otherAccounts.map((otherUsername) => {
            const shared = grantedTo.has(otherUsername);
            return (
              <label
                key={otherUsername}
                className="flex items-center justify-between gap-3 rounded-md border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.1]"
              >
                <span>Share my dashboards with {otherUsername}</span>
                <input
                  type="checkbox"
                  checked={shared}
                  disabled={busyUsername === otherUsername}
                  onChange={() => toggle(otherUsername)}
                  className="h-4 w-4"
                />
              </label>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {receivedFrom.length > 0 && (
        <p className="text-xs text-zinc-500">
          Shared with you by: {receivedFrom.join(", ")} — their dashboards show up in your sidebar, read-only.
        </p>
      )}
    </div>
  );
}
