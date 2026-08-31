"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

type Tab = { id: string; name: string; order: number };
type DashboardRow = { id: string; name: string; published: boolean; tabs: Tab[] };

const inputClasses =
  "w-full rounded-md border border-black/[.1] bg-white px-2 py-1 text-xs outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500";

const navLinkClasses =
  "rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.03] dark:hover:bg-white/[.05] creamsicle:hover:bg-orange-100";

/**
 * One dashboard's row in the sidebar (see DashboardNavList, its Server
 * Component parent) — the dashboard link itself, and, only while that
 * dashboard is the one currently open, its tabs "popped out" underneath:
 * a tab list (switching tabs is a real navigation via `?tab=`, not local
 * state — see app/(site)/dashboards/[id]/page.tsx), an "+ Tab" row at the
 * same level/style as the sidebar's own "Create Dashboard" link above it,
 * and the publish toggle + delete dashboard controls that used to live in
 * DashboardTabs' header row (removed — everything about a dashboard's
 * identity and structure lives here now, next to its own name in the nav,
 * rather than repeated at the top of the page every time it's open).
 */
export function DashboardNavItem({ dashboard }: { dashboard: DashboardRow }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const href = `/dashboards/${dashboard.id}`;
  const active = pathname === href;
  const tabs = dashboard.tabs;
  const activeTabId = active ? (searchParams.get("tab") ?? tabs[0]?.id ?? null) : null;

  const [published, setPublished] = useState(dashboard.published);
  const [togglingPublish, setTogglingPublish] = useState(false);
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [creatingTab, setCreatingTab] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tabNameDraft, setTabNameDraft] = useState("");
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [deletingTabId, setDeletingTabId] = useState<string | null>(null);
  const [movingTabId, setMovingTabId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteNameInput, setDeleteNameInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePublished() {
    const next = !published;
    setTogglingPublish(true);
    setPublished(next); // optimistic — this is just a view-mode flip, cheap to revert on failure
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!res.ok) {
        setPublished(!next);
      } else {
        router.refresh();
      }
    } catch {
      setPublished(!next);
    } finally {
      setTogglingPublish(false);
    }
  }

  async function handleCreateTab(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTabName.trim();
    if (!trimmed) return;
    setCreatingTab(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}/tabs`, {
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
      setAddingTab(false);
      setNewTabName("");
      router.push(`${href}?tab=${body.tab.id}`);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setCreatingTab(false);
    }
  }

  async function handleRenameTab(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    const trimmed = tabNameDraft.trim();
    if (!tab || !trimmed || trimmed === tab.name) {
      setEditingTabId(null);
      return;
    }
    setRenamingTabId(tabId);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}/tabs/${tabId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to rename tab (${res.status}).`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setEditingTabId(null);
      setRenamingTabId(null);
    }
  }

  async function handleDeleteTab(tabId: string, tabName: string) {
    if (tabs.length <= 1) return; // guarded server-side too, but no point round-tripping
    if (!window.confirm(`Delete the "${tabName}" tab and all its widgets? This can't be undone.`)) return;
    setDeletingTabId(tabId);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}/tabs/${tabId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to delete tab (${res.status}).`);
        return;
      }
      if (activeTabId === tabId) {
        const remaining = tabs.filter((t) => t.id !== tabId);
        if (remaining[0]) router.push(`${href}?tab=${remaining[0].id}`);
      }
      router.refresh();
    } finally {
      setDeletingTabId(null);
    }
  }

  /** Swaps a tab with its immediate up/down neighbor in `tabs` (already
   * sorted by `order` — see DashboardNavList's own `orderBy`). Reassigns
   * both by their *array position*, not by swapping whatever their two
   * `order` values currently happen to be — tabs created before this field
   * existed can all share the same default, and swapping two equal numbers
   * would be a silent no-op. Only ever touches two rows regardless of how
   * many tabs there are, so no dedicated bulk-reorder endpoint is needed
   * for a one-step move. */
  async function moveTab(tabId: string, direction: -1 | 1) {
    const index = tabs.findIndex((t) => t.id === tabId);
    const neighborIndex = index + direction;
    if (index === -1 || neighborIndex < 0 || neighborIndex >= tabs.length) return;
    const tab = tabs[index];
    const neighbor = tabs[neighborIndex];
    setMovingTabId(tabId);
    setError(null);
    try {
      const [res1, res2] = await Promise.all([
        fetch(`/api/dashboards/${dashboard.id}/tabs/${tab.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: neighborIndex }),
        }),
        fetch(`/api/dashboards/${dashboard.id}/tabs/${neighbor.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: index }),
        }),
      ]);
      if (!res1.ok || !res2.ok) {
        setError("Failed to reorder tabs.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setMovingTabId(null);
    }
  }

  async function handleDeleteDashboard() {
    if (deleteNameInput !== dashboard.name) return; // button is disabled for this too — just a safety net
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to delete dashboard (${res.status}).`);
        setDeleting(false);
        return;
      }
      router.push("/dashboards");
    } catch {
      setError("Network error — try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col">
      <Link
        href={href}
        className={
          navLinkClasses +
          " " +
          (active
            ? "bg-black/[.05] text-zinc-950 dark:bg-white/[.08] dark:text-zinc-50 creamsicle:bg-orange-100 creamsicle:text-orange-950"
            : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:text-orange-950")
        }
      >
        {dashboard.name}
      </Link>

      {active && (
        <div className="mt-0.5 mb-1 ml-2 flex flex-col gap-0.5 border-l border-black/[.08] pl-2 dark:border-white/[.1] creamsicle:border-orange-200">
          {tabs.map((tab, i) =>
            editingTabId === tab.id ? (
              <input
                key={tab.id}
                type="text"
                autoFocus
                value={tabNameDraft}
                disabled={renamingTabId === tab.id}
                onChange={(e) => setTabNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setTabNameDraft(tab.name);
                    setEditingTabId(null);
                  }
                }}
                onBlur={() => handleRenameTab(tab.id)}
                className={inputClasses}
              />
            ) : (
              <div
                key={tab.id}
                className={
                  "group flex items-center gap-0.5 rounded-md pl-2 pr-1 py-1 text-xs font-medium transition-colors " +
                  (tab.id === activeTabId
                    ? "bg-black/[.05] text-zinc-950 dark:bg-white/[.08] dark:text-zinc-50 creamsicle:bg-orange-100 creamsicle:text-orange-950"
                    : "text-zinc-500 hover:bg-black/[.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-100 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50")
                }
              >
                <Link href={`${href}?tab=${tab.id}`} className="min-w-0 flex-1 truncate">
                  {tab.name}
                </Link>
                <button
                  type="button"
                  onClick={() => moveTab(tab.id, -1)}
                  disabled={i === 0 || movingTabId !== null}
                  title="Move up"
                  aria-label={`Move "${tab.name}" up`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveTab(tab.id, 1)}
                  disabled={i === tabs.length - 1 || movingTabId !== null}
                  title="Move down"
                  aria-label={`Move "${tab.name}" down`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTabNameDraft(tab.name);
                    setEditingTabId(tab.id);
                  }}
                  title={`Rename "${tab.name}"`}
                  aria-label={`Rename "${tab.name}"`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-indigo-400"
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTab(tab.id, tab.name)}
                  disabled={deletingTabId === tab.id || tabs.length <= 1}
                  title={tabs.length <= 1 ? "Can't delete a dashboard's last tab" : `Delete "${tab.name}"`}
                  aria-label={tabs.length <= 1 ? "Can't delete a dashboard's last tab" : `Delete "${tab.name}"`}
                  className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deletingTabId === tab.id ? "…" : "✕"}
                </button>
              </div>
            ),
          )}

          {addingTab ? (
            <form onSubmit={handleCreateTab} className="flex flex-col gap-1 py-0.5">
              <input
                type="text"
                autoFocus
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                onBlur={() => {
                  if (!newTabName.trim()) setAddingTab(false);
                }}
                placeholder="Tab name"
                className={inputClasses}
              />
              <button
                type="submit"
                disabled={creatingTab || !newTabName.trim()}
                className="self-start rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 creamsicle:bg-orange-600"
              >
                {creatingTab ? "…" : "Add"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingTab(true)}
              className="flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-black/[.03] hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/[.05] dark:hover:text-zinc-300 creamsicle:text-orange-400 creamsicle:hover:bg-orange-50 creamsicle:hover:text-orange-700"
            >
              Add tab
              <span aria-hidden="true">+</span>
            </button>
          )}

          <div className="mt-1 flex flex-col gap-1 border-t border-black/[.06] pt-1.5 dark:border-white/[.08] creamsicle:border-orange-200">
            <div className="flex items-center justify-between px-2">
              <span
                className={
                  "text-[10px] font-medium tracking-wide uppercase " +
                  (published ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")
                }
              >
                {published ? "Published" : "Editing"}
              </span>
              <button
                type="button"
                onClick={togglePublished}
                disabled={togglingPublish}
                className="text-xs font-medium text-zinc-600 underline hover:text-zinc-950 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50 creamsicle:text-orange-700 creamsicle:hover:text-orange-950"
              >
                {published ? "Switch to editing" : "Publish"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="rounded-md px-2 py-1 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Delete dashboard
            </button>
          </div>

          {error && <p className="px-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      {deleteModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => (deleting ? null : setDeleteModalOpen(false))} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-black/[.1] bg-[var(--background)] p-5 shadow-xl dark:border-white/[.15]">
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Delete dashboard</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This will permanently delete <span className="font-semibold">{dashboard.name}</span> — every tab
                and every widget in it. This cannot be undone.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">
                  Type <span className="font-mono font-semibold">{dashboard.name}</span> to confirm
                </span>
                <input
                  type="text"
                  autoFocus
                  value={deleteNameInput}
                  onChange={(e) => setDeleteNameInput(e.target.value)}
                  className="rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
                />
              </label>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteModalOpen(false);
                    setDeleteNameInput("");
                    setError(null);
                  }}
                  disabled={deleting}
                  className="rounded-md border border-black/[.1] px-4 py-2 text-sm text-zinc-600 hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.15] dark:text-zinc-400 dark:hover:bg-white/[.05]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDashboard}
                  disabled={deleting || deleteNameInput !== dashboard.name}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-40 dark:bg-red-700 dark:hover:bg-red-600"
                >
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
