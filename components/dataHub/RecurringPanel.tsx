"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RecurringGroupSummary } from "@/lib/recurringDetection";

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const INTERVAL_LABELS: Record<RecurringGroupSummary["interval"], string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

function confidenceLabel(confidence: number): { label: string; classes: string } {
  if (confidence >= 0.75) {
    return { label: "High confidence", classes: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
  }
  if (confidence >= 0.5) {
    return { label: "Medium confidence", classes: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  }
  return { label: "Uncertain", classes: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400" };
}

/**
 * Data Hub's "Recurring charges" review queue — pending groups from
 * lib/recurringDetection.ts, one row per merchant+cadence pattern, each
 * with a Confirm/Dismiss action. Confirm just marks it reviewed (nothing
 * else reads that status yet — a subscriptions-focused dashboard metric
 * pulling from confirmed groups is a natural next step, not built today).
 * Dismiss sticks even across future scans — see the API route's own
 * comments.
 */
export function RecurringPanel({ initialGroups }: { initialGroups: RecurringGroupSummary[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [scanning, setScanning] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanSummary, setLastScanSummary] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/recurring/detect", { method: "POST" });
      if (!res.ok) {
        setError("Scan failed — try again.");
        return;
      }
      const body = await res.json();
      const { groupsCreated, groupsUpdated } = body.summary ?? {};
      setLastScanSummary(
        groupsCreated || groupsUpdated
          ? `Found ${groupsCreated ?? 0} new pattern${groupsCreated === 1 ? "" : "s"}${groupsUpdated ? `, updated ${groupsUpdated}` : ""}.`
          : "No new recurring patterns found.",
      );
      router.refresh();
      const listRes = await fetch("/api/finance/recurring?status=pending");
      if (listRes.ok) {
        const listBody = await listRes.json();
        setGroups(listBody.groups ?? []);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setScanning(false);
    }
  }

  async function handleAction(id: string, status: "confirmed" | "dismissed") {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/finance/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError("Failed to update — try again.");
        return;
      }
      setGroups((prev) => prev.filter((g) => g.id !== id));
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.1] creamsicle:border-orange-200">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50"
        >
          <span className={"inline-block transition-transform " + (collapsed ? "-rotate-90" : "")}>▾</span>
          Recurring charges
          {groups.length > 0 && (
            <span className="rounded-full bg-black/[.06] px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-white/[.1] dark:text-zinc-300">
              {groups.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600"
        >
          {scanning ? "Scanning…" : "Scan for recurring charges"}
        </button>
      </div>

      {lastScanSummary && <p className="text-xs text-zinc-500">{lastScanSummary}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {!collapsed && (
        <>
          {groups.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nothing to review — run a scan, or everything detected so far has been confirmed or dismissed.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {groups.map((g) => {
                const confidence = confidenceLabel(g.confidence);
                return (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/[.06] px-3 py-2 dark:border-white/[.08]"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">{g.merchant}</span>
                        <span className="rounded-full bg-black/[.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/[.08] dark:text-zinc-300">
                          {INTERVAL_LABELS[g.interval]}
                        </span>
                        <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-medium " + confidence.classes} title={`${Math.round(g.confidence * 100)}% confidence`}>
                          {confidence.label}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500">
                        ~{currencyFormatter.format(g.averageAmount)} · {g.chargeCount} charges · last {g.lastCharged}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAction(g.id, "dismissed")}
                        disabled={actingId === g.id}
                        className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-black/[.05] disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/[.08]"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(g.id, "confirmed")}
                        disabled={actingId === g.id}
                        className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600"
                      >
                        {actingId === g.id ? "…" : "Confirm"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
