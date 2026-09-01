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

const iconButtonClasses =
  "rounded-md p-1 text-zinc-500 transition-colors hover:bg-black/[.06] hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/[.08] dark:hover:text-zinc-100";

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6 4V2.5h4V4M5 4l.5 9.5a1 1 0 0 0 1 .95h3a1 1 0 0 0 1-.95L11 4M6.5 7v4M9.5 7v4" />
    </svg>
  );
}

// Distinct from togglePublished's own "✎"/"✓" text glyphs below — a real
// icon so the rename trigger doesn't read as the same control once both
// sit in the same row (see the top-level nav row, which used to keep these
// apart: rename lived on a second, bolded heading line inside the panel;
// see 2026-08-31's "collapse the duplicate dashboard name" fix).
function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 2.5l2.5 2.5-8 8H3v-2.5l8-8z" />
    </svg>
  );
}

/**
 * One dashboard's row in the sidebar (see DashboardNavList, its Server
 * Component parent) — the link itself, plus (only while that dashboard is
 * the one currently open) its name/tabs/publish/delete controls nested
 * directly underneath — the sidebar is wide enough (see app/(site)/
 * layout.tsx) that this doesn't need its own separate column. Clicking the
 * name while it's already the active dashboard toggles that panel closed/
 * open again instead of navigating (there's nowhere else to navigate to);
 * clicking a *different* dashboard always opens its panel fresh.
 */
export function DashboardNavItem({ dashboard }: { dashboard: DashboardRow }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const href = `/dashboards/${dashboard.id}`;
  const active = pathname === href;
  const tabs = dashboard.tabs;
  const activeTabId = active ? (searchParams.get("tab") ?? tabs[0]?.id ?? null) : null;

  // Manually toggled closed while still on this dashboard's own page —
  // separate from `active`, which just tracks whether this is the
  // dashboard the URL currently points at. Reset open again whenever
  // navigation *into* this dashboard happens (active flips false -> true),
  // so leaving and coming back always shows the panel fresh rather than
  // staying collapsed from an earlier visit. Adjusted during render (React's
  // own documented pattern for "reset state when a value changes") rather
  // than in an effect, which would set state after an extra, avoidable
  // render.
  const [collapsed, setCollapsed] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setCollapsed(false);
  }

  const [name, setName] = useState(dashboard.name);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(dashboard.name);
  const [renamingName, setRenamingName] = useState(false);
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
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  // Which half of dragOverTabId's row the pointer is over — drives both the
  // insertion-line placement and where the drop actually lands, so what the
  // user sees is exactly what happens (see reorderTabs).
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after">("after");
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

  async function handleRenameDashboard() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) {
      setEditingName(false);
      return;
    }
    setRenamingName(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to rename dashboard (${res.status}).`);
        setNameDraft(name); // revert the input to what's actually saved
        return;
      }
      setName(trimmed);
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setNameDraft(name);
    } finally {
      setEditingName(false);
      setRenamingName(false);
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

  /** Drops `draggedId` immediately before or after `targetId`, per
   * `position` — decided by which half of the target row the pointer was
   * over when it dropped (see the insertion-line rendering below), not by
   * which direction the drag came from. That makes the drop land exactly
   * where the line was shown, instead of the old behavior where the same
   * target row meant "insert before" when dragging forward and "insert
   * after" when dragging backward, with no visual to tell you which.
   * Reassigns every tab's `order` to its *new array position*, not just the
   * two endpoints — tabs created before `order` existed can all share the
   * same default value, so anything short of "recompute the whole sequence"
   * risks two tabs landing on the same number. Native HTML5 drag-and-drop
   * rather than a library: a handful of tabs in one list doesn't need more
   * than dragstart/dragover/drop. */
  async function reorderTabs(draggedId: string, targetId: string, position: "before" | "after") {
    if (draggedId === targetId) return;
    const dragged = tabs.find((t) => t.id === draggedId);
    if (!dragged) return;
    const withoutDragged = tabs.filter((t) => t.id !== draggedId);
    const targetIndex = withoutDragged.findIndex((t) => t.id === targetId);
    if (targetIndex === -1) return;
    const insertAt = position === "before" ? targetIndex : targetIndex + 1;
    const reordered = [...withoutDragged];
    reordered.splice(insertAt, 0, dragged);

    setMovingTabId(draggedId);
    setError(null);
    try {
      const results = await Promise.all(
        reordered.map((tab, i) =>
          fetch(`/api/dashboards/${dashboard.id}/tabs/${tab.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order: i }),
          }),
        ),
      );
      if (results.some((res) => !res.ok)) {
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
    if (deleteNameInput !== name) return; // button is disabled for this too — just a safety net
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

  const expanded = active && !collapsed;

  const panel = (
    <div className="mt-1 mb-2 ml-2 flex flex-col gap-2 border-l border-black/[.08] py-1 pl-3 dark:border-white/[.1] creamsicle:border-orange-200">
      <span
        className={
          "self-start rounded-full px-2 py-0.5 text-[10px] font-medium " +
          (published
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
        }
      >
        {published ? "Published — view only" : "Editing"}
      </span>

      <div className="flex flex-col gap-0.5">
        {tabs.map((tab) =>
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
              draggable
              onDragStart={(e) => {
                setDraggedTabId(tab.id);
                // Firefox won't fire subsequent drag events at all without
                // data actually set on the transfer object, even though
                // this handler reads state instead of the transfer itself.
                e.dataTransfer.setData("text/plain", tab.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!draggedTabId || draggedTabId === tab.id) return;
                e.preventDefault(); // required for onDrop to fire at all
                const rect = e.currentTarget.getBoundingClientRect();
                setDragOverTabId(tab.id);
                setDragOverPosition(e.clientY - rect.top < rect.height / 2 ? "before" : "after");
              }}
              onDragLeave={() => setDragOverTabId((id) => (id === tab.id ? null : id))}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedTabId) reorderTabs(draggedTabId, tab.id, dragOverPosition);
                setDraggedTabId(null);
                setDragOverTabId(null);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                setDragOverTabId(null);
              }}
              className={
                "group relative flex cursor-grab items-center gap-0.5 rounded-md py-1.5 pr-1 pl-2 text-sm font-medium transition-colors active:cursor-grabbing " +
                (tab.id === activeTabId
                  ? "bg-black/[.05] text-zinc-950 dark:bg-white/[.08] dark:text-zinc-50 creamsicle:bg-orange-100 creamsicle:text-orange-950"
                  : "text-zinc-600 hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50") +
                (draggedTabId === tab.id ? " opacity-40" : "")
              }
            >
              {/* Insertion line — shows exactly where the tab will land
                  (above/below this row) instead of highlighting the whole
                  row, which used to read as "swap with this tab" rather
                  than "insert here". */}
              {dragOverTabId === tab.id && draggedTabId !== tab.id && (
                <span
                  aria-hidden="true"
                  className={
                    "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-indigo-500 dark:bg-indigo-400 " +
                    (dragOverPosition === "before" ? "-top-px" : "-bottom-px")
                  }
                />
              )}
              {/* draggable=false: an <a> is natively draggable on its own
                  in most browsers, which would fight the row's own drag
                  handlers above (and start an actual link-drag instead). */}
              <Link href={`${href}?tab=${tab.id}`} draggable={false} className="min-w-0 flex-1 truncate">
                {tab.name}
              </Link>
              {movingTabId === tab.id && <span className="text-[10px] text-zinc-400">…</span>}
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
            className={navLinkClasses + " flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400"}
          >
            Add tab
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Dashboard name, and (only while this dashboard is the active one)
          its rename/publish/delete controls — all one row now. These used
          to be split across two lines (this plain nav link, plus a second
          bolded heading with the same name inside the expanded panel below)
          which just duplicated the name for no reason; the buttons that
          used to live on that second line are folded in here instead. */}
      <div
        className={
          "flex items-center gap-0.5 rounded-md " +
          (active ? "bg-black/[.05] dark:bg-white/[.08] creamsicle:bg-orange-100" : "")
        }
      >
        {editingName ? (
          <input
            type="text"
            autoFocus
            value={nameDraft}
            disabled={renamingName}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameDraft(name);
                setEditingName(false);
              }
            }}
            onBlur={handleRenameDashboard}
            className={inputClasses + " my-0.5 ml-1 text-sm font-medium"}
          />
        ) : (
          <Link
            href={href}
            onClick={(e) => {
              // Already here — nowhere to navigate to, so this click just
              // means "toggle the panel," not "go to this page."
              if (active) {
                e.preventDefault();
                setCollapsed((c) => !c);
              }
            }}
            title={active ? (collapsed ? "Show tabs" : "Hide tabs") : undefined}
            className={
              "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm font-medium transition-colors " +
              (active
                ? "text-zinc-950 dark:text-zinc-50 creamsicle:text-orange-950"
                : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:text-orange-950")
            }
          >
            {name}
          </Link>
        )}
        {active && !editingName && (
          <div className="flex shrink-0 items-center gap-0.5 pr-1">
            <button
              type="button"
              onClick={() => {
                setNameDraft(name);
                setEditingName(true);
              }}
              title="Rename dashboard"
              aria-label="Rename dashboard"
              className={iconButtonClasses}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={togglePublished}
              disabled={togglingPublish}
              title={published ? "Switch to editing" : "Publish"}
              aria-label={published ? "Switch to editing" : "Publish"}
              className={iconButtonClasses}
            >
              {published ? "✎" : "✓"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              title="Delete dashboard"
              aria-label="Delete dashboard"
              className={iconButtonClasses + " hover:text-red-600 dark:hover:text-red-400"}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>

      {expanded && panel}

      {deleteModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => (deleting ? null : setDeleteModalOpen(false))} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-black/[.1] bg-[var(--background)] p-5 shadow-xl dark:border-white/[.15]">
              <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Delete dashboard</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This will permanently delete <span className="font-semibold">{name}</span> — every tab
                and every widget in it. This cannot be undone.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-zinc-500">
                  Type <span className="font-mono font-semibold">{name}</span> to confirm
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
                  disabled={deleting || deleteNameInput !== name}
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
