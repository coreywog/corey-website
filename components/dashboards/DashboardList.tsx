"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DashboardRow = { id: string; name: string; widgetCount: number };

const inputClasses =
  "rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";

/** Lists dashboards, lets you create a new one or delete an existing one. */
export function DashboardList({ dashboards }: { dashboards: DashboardRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to create (${res.status}).`);
        return;
      }
      const body = await res.json();
      router.push(`/dashboards/${body.dashboard.id}`);
    } catch {
      setError("Network error — try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, dashboardName: string) {
    if (!window.confirm(`Delete "${dashboardName}" and all its widgets? This can't be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {dashboards.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing yet — build your own view of your data below.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {dashboards.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-md border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.1] creamsicle:border-orange-200"
            >
              <Link href={`/dashboards/${d.id}`} className="flex-1 font-medium hover:underline">
                {d.name}
              </Link>
              <span className="mr-3 text-zinc-500">
                {d.widgetCount} widget{d.widgetCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(d.id, d.name)}
                disabled={deletingId === d.id}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-red-600 disabled:opacity-30 dark:hover:text-red-400"
              >
                {deletingId === d.id ? "Removing…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-zinc-500">New dashboard name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Airbnb tracking"
            className={inputClasses}
          />
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
