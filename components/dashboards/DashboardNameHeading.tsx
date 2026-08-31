"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The dashboard's own name, click-to-rename — same interaction this used to
 * have inline in DashboardTabs' header row before tabs and the publish/
 * delete controls moved into the sidebar (DashboardNavItem). Kept on the
 * main page rather than folded into the sidebar too: the sidebar link
 * already carries the name, and turning that into an inline-editable field
 * as well would double up the same rename UI in two cramped places for no
 * real benefit.
 */
export function DashboardNameHeading({ dashboardId, name: initialName }: { dashboardId: string; name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialName);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to rename dashboard (${res.status}).`);
        setDraft(name); // revert the input to what's actually saved
        return;
      }
      setName(trimmed);
      // The sidebar's own dashboard list is a Server Component — it only
      // picks up the new name once the page's data is refetched.
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setDraft(name);
    } finally {
      setEditing(false);
      setRenaming(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {editing ? (
        <input
          type="text"
          autoFocus
          value={draft}
          disabled={renaming}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
          onBlur={handleRename}
          className="rounded-md border border-black/[.15] bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none focus:border-zinc-400 dark:border-white/[.2]"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
          className="group/name flex w-fit items-center gap-1.5"
          title="Rename dashboard"
        >
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <span className="text-sm text-zinc-400 opacity-0 transition-opacity group-hover/name:opacity-100">✎</span>
        </button>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
