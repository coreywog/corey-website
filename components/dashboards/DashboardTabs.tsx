"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardGrid } from "./DashboardGrid";
import type { WidgetWithData } from "./Widget";

type Tab = { id: string; name: string; widgets: WidgetWithData[] };
type Account = { id: string; name: string };
type CategoryOption = { category: string; subcategory: string };

const inputClasses =
  "rounded-md border border-black/[.1] bg-white px-2 py-1 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";

function tabButtonClasses(active: boolean) {
  return (
    "group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
    (active
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600 creamsicle:text-white"
      : "text-zinc-500 hover:bg-black/[.05] dark:text-zinc-400 dark:hover:bg-white/[.08] creamsicle:text-orange-600 creamsicle:hover:bg-orange-50")
  );
}

/**
 * A dashboard's tab bar — each tab is its own independent widget grid (see
 * DashboardTab in prisma/schema.prisma), switched between like browser
 * tabs rather than filtering one shared grid. Every tab's widgets are
 * computed server-side up front (app/(site)/dashboards/[id]/page.tsx), so
 * switching tabs here is instant, no fetch.
 */
export function DashboardTabs({
  dashboardId,
  tabs,
  accounts,
  categoryOptions,
  initialPublished,
}: {
  dashboardId: string;
  tabs: Tab[];
  accounts: Account[];
  categoryOptions: CategoryOption[];
  initialPublished: boolean;
}) {
  const router = useRouter();
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A refresh (e.g. after adding a widget) re-renders with the same set of
  // tab ids, so activeTabId just carries over untouched. Only reset it when
  // the active tab has actually disappeared (deleted from elsewhere) or on
  // first load.
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;
  if (activeTab && activeTab.id !== activeTabId) setActiveTabId(activeTab.id);

  async function handleCreateTab(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTabName.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to create tab (${res.status}).`);
        return;
      }
      const body = await res.json();
      setActiveTabId(body.tab.id);
      setAdding(false);
      setNewTabName("");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteTab(tabId: string, name: string) {
    if (tabs.length <= 1) return; // guarded server-side too, but no point round-tripping
    if (!window.confirm(`Delete the "${name}" tab and all its widgets? This can't be undone.`)) return;
    setDeletingId(tabId);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to delete tab (${res.status}).`);
        return;
      }
      if (activeTabId === tabId) {
        const remaining = tabs.filter((t) => t.id !== tabId);
        setActiveTabId(remaining[0]?.id ?? null);
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <div key={tab.id} className={tabButtonClasses(tab.id === activeTabId)}>
            <button type="button" onClick={() => setActiveTabId(tab.id)}>
              {tab.name}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteTab(tab.id, tab.name)}
                disabled={deletingId === tab.id}
                title={`Delete "${tab.name}"`}
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 disabled:opacity-40"
              >
                {deletingId === tab.id ? "…" : "✕"}
              </button>
            )}
          </div>
        ))}

        {adding ? (
          <form onSubmit={handleCreateTab} className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onBlur={() => {
                if (!newTabName.trim()) setAdding(false);
              }}
              placeholder="Tab name"
              className={inputClasses}
            />
            <button
              type="submit"
              disabled={creating || !newTabName.trim()}
              className="rounded-full bg-zinc-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600"
            >
              {creating ? "…" : "Add"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-black/[.05] hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/[.08] dark:hover:text-zinc-300 creamsicle:text-orange-400 creamsicle:hover:bg-orange-50 creamsicle:hover:text-orange-700"
            aria-label="Add tab"
          >
            + Tab
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {activeTab && (
        <DashboardGrid
          key={activeTab.id}
          dashboardId={dashboardId}
          tabId={activeTab.id}
          widgets={activeTab.widgets}
          accounts={accounts}
          categoryOptions={categoryOptions}
          initialPublished={initialPublished}
        />
      )}
    </div>
  );
}
