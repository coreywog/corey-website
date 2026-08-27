"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { calcGridCellDimensions } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Widget, type WidgetWithData } from "./Widget";
import { WidgetEditorPanel, type ExistingWidget, type WidgetDraft } from "./WidgetEditorPanel";

// Debounced, not fired on every pixel of movement — react-grid-layout's
// onLayoutChange fires continuously during a drag/resize (that's what
// drives the live re-flow), but persisting on every one of those would be
// a request per frame. This just needs to land once the user stops.
const SAVE_DEBOUNCE_MS = 500;

// The not-yet-real widget being configured — participates in the same
// interactive grid as everything else (draggable/resizable) so sizing it is
// just resizing this tile like any other, but its position is never
// persisted to the server until Save actually creates the real widget.
const NEW_WIDGET_ID = "__new__";
const DEFAULT_WIDTH = 12;
const DEFAULT_HEIGHT = 4;
const COLS = 12;
const ROW_HEIGHT = 56;
const MARGIN: readonly [number, number] = [12, 12];
// Corners only, per request — not the full 8-handle set react-grid-layout
// supports, since edge handles (n/s/e/w) weren't asked for and clutter a
// small tile.
const RESIZE_HANDLES = ["nw", "ne", "sw", "se"] as const;

type Account = { id: string; name: string };
type CategoryOption = { category: string; subcategory: string };

function layoutFromWidgets(list: WidgetWithData[]): Layout {
  return list.map((widget) => ({ i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h }));
}

/** Every grid cell not covered by any layout item other than `excludeId`. */
function emptyCells(layout: Layout, excludeId: string): { x: number; y: number }[] {
  const occupied = new Set<string>();
  let bottom = 0;
  for (const item of layout) {
    if (item.i === excludeId) continue;
    bottom = Math.max(bottom, item.y + item.h);
    for (let x = item.x; x < item.x + item.w; x++) {
      for (let y = item.y; y < item.y + item.h; y++) {
        occupied.add(`${x},${y}`);
      }
    }
  }
  const rows = bottom + 2; // a little slack below the current content
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!occupied.has(`${x},${y}`)) cells.push({ x, y });
    }
  }
  return cells;
}

export function DashboardGrid({
  dashboardId,
  tabId,
  widgets,
  accounts,
  categoryOptions,
  initialPublished,
}: {
  dashboardId: string;
  tabId: string;
  widgets: WidgetWithData[];
  accounts: Account[];
  categoryOptions: CategoryOption[];
  initialPublished: boolean;
}) {
  const router = useRouter();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1152 });

  const [published, setPublished] = useState(initialPublished);
  const [togglingPublish, setTogglingPublish] = useState(false);

  const widgetIds = widgets.map((w) => w.id).join(",");
  const [layout, setLayout] = useState<Layout>(() => layoutFromWidgets(widgets));
  // Adjusting state to match a prop change, without an Effect (React's own
  // recommended pattern for this): a router.refresh() after adding/deleting
  // a widget re-renders this same component instance with a new `widgets`
  // prop, but `layout` was only ever seeded once, on mount. Without this, a
  // freshly-added widget has no entry in `layout` at all, so
  // react-grid-layout silently defaults it to 1x1 and then persists that
  // wrong size back over the correct one the next time onLayoutChange
  // fires. Only resets when the set of widget ids actually changes (add/
  // delete), so an in-progress drag on an unrelated widget isn't disturbed.
  const [syncedIds, setSyncedIds] = useState(widgetIds);
  if (widgetIds !== syncedIds) {
    setSyncedIds(widgetIds);
    setLayout(layoutFromWidgets(widgets));
  }

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorState, setEditorState] = useState<{ mode: "add" } | { mode: "edit"; widget: ExistingWidget } | null>(
    null,
  );
  const [draft, setDraft] = useState<WidgetDraft | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Set while a drag or resize is in progress (to the id of the item being
  // moved) so the grid can show dashed "you can drop it here" outlines over
  // every other open cell — cleared the instant the gesture ends.
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const isAdding = editorState?.mode === "add";

  const persistLayout = useCallback(
    (next: Layout) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      if (next.length === 0) return; // nothing to save — e.g. the last widget was just deleted
      saveTimeout.current = setTimeout(() => {
        fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}/layout`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widgets: next.map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h })),
          }),
        }).catch(() => {
          // Best-effort — the grid already reflects the new layout locally;
          // a failed save just means it'll re-load in the old position next
          // visit, not a broken UI right now.
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [dashboardId, tabId],
  );

  function handleLayoutChange(next: Layout) {
    setLayout(next);
    // Never persist while the not-yet-real ghost tile is part of the grid —
    // it can shove other tiles around as it's dragged/resized, and none of
    // that should land on the server until Save actually creates something.
    if (!isAdding) persistLayout(next);
  }

  function openAdd() {
    const bottom = widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    setLayout((prev) => [...prev, { i: NEW_WIDGET_ID, x: 0, y: bottom, w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT }]);
    setEditorState({ mode: "add" });
  }

  function closeEditor() {
    setEditorState(null);
    setDraft(null);
    // Discards the ghost tile and reverts anything it shoved around while
    // being resized/dragged, back to the server's last-known layout.
    setLayout(layoutFromWidgets(widgets));
  }

  async function handleDelete(widgetId: string) {
    setDeletingId(widgetId);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/tabs/${tabId}/widgets/${widgetId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  async function togglePublished() {
    const next = !published;
    setTogglingPublish(true);
    setPublished(next); // optimistic — this is just a view-mode flip, cheap to revert on failure
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!res.ok) {
        setPublished(!next);
        return;
      }
      // published is dashboard-level, not per-tab — refresh so the server
      // prop other tabs are seeded from (switching tabs remounts this
      // component) reflects the change too, not just this tab's local state.
      router.refresh();
    } catch {
      setPublished(!next);
    } finally {
      setTogglingPublish(false);
    }
  }

  // Real widgets, substituting the live draft's result for whichever one is
  // currently being edited — the "preview in the spot" behavior.
  const displayWidgets: WidgetWithData[] = widgets.map((w) => {
    if (editorState?.mode === "edit" && editorState.widget.id === w.id && draft) {
      return { ...w, type: draft.type, title: draft.title, result: draft.result, config: draft.config };
    }
    return w;
  });

  const ghostLayoutItem = layout.find((item) => item.i === NEW_WIDGET_ID);
  if (isAdding && ghostLayoutItem) {
    displayWidgets.push({
      id: NEW_WIDGET_ID,
      type: draft?.type ?? "bar",
      title: draft?.title ?? null,
      x: ghostLayoutItem.x,
      y: ghostLayoutItem.y,
      w: ghostLayoutItem.w,
      h: ghostLayoutItem.h,
      config: draft?.config ?? null,
      result: draft?.result ?? { error: "Fill in the fields to see a preview." },
    });
  }

  const cellDims = calcGridCellDimensions({ width, cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN });
  const openSlots = !published && activeItemId ? emptyCells(layout, activeItemId) : [];

  return (
    <>
      <div className="flex items-center justify-between">
        <span
          className={
            "rounded-full px-2.5 py-1 text-xs font-medium " +
            (published
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400")
          }
        >
          {published ? "Published — view only" : "Editing"}
        </span>
        <button
          type="button"
          onClick={togglePublished}
          disabled={togglingPublish}
          className="rounded-md border border-black/[.1] px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.15] dark:text-zinc-300 dark:hover:bg-white/[.05] creamsicle:border-orange-300 creamsicle:text-orange-700 creamsicle:hover:bg-orange-50"
        >
          {published ? "Edit dashboard" : "Publish"}
        </button>
      </div>

      <div ref={containerRef} className="relative">
        {mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
            dragConfig={{ enabled: !published, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: !published, handles: RESIZE_HANDLES }}
            onLayoutChange={handleLayoutChange}
            onDragStart={(_layout, _oldItem, newItem) => setActiveItemId(newItem?.i ?? null)}
            onDragStop={() => setActiveItemId(null)}
            onResizeStart={(_layout, _oldItem, newItem) => setActiveItemId(newItem?.i ?? null)}
            onResizeStop={() => setActiveItemId(null)}
          >
            {displayWidgets.map((widget) => (
              <div key={widget.id} className="group relative">
                {!published && widget.id !== NEW_WIDGET_ID && (
                  <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {widget.config && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditorState({
                            mode: "edit",
                            widget: {
                              id: widget.id,
                              type: widget.type as ExistingWidget["type"],
                              title: widget.title,
                              config: widget.config!,
                            },
                          })
                        }
                        className="rounded-md bg-black/[.06] px-1.5 py-0.5 text-xs hover:bg-black/[.12] dark:bg-white/[.1] dark:hover:bg-white/[.18]"
                        title="Edit"
                      >
                        ✎
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(widget.id)}
                      disabled={deletingId === widget.id}
                      className="rounded-md bg-black/[.06] px-1.5 py-0.5 text-xs text-red-600 hover:bg-black/[.12] disabled:opacity-40 dark:bg-white/[.1] dark:text-red-400 dark:hover:bg-white/[.18]"
                      title="Delete"
                    >
                      {deletingId === widget.id ? "…" : "✕"}
                    </button>
                  </div>
                )}
                <Widget widget={widget} />
              </div>
            ))}
          </ReactGridLayout>
        )}

        {/* Snap-target hints — every open cell, shown only while a drag or
            resize is actively in progress, so it's obvious where else the
            tile could go. Purely visual, not part of react-grid-layout's own
            layout tree — absolutely positioned over it using the same pixel
            math the grid itself uses (calcGridCellDimensions), so they line
            up exactly. */}
        {openSlots.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-0">
            {openSlots.map(({ x, y }) => (
              <div
                key={`${x},${y}`}
                className="absolute rounded-lg border-2 border-dashed border-indigo-400/50 dark:border-indigo-300/40"
                style={{
                  left: cellDims.offsetX + x * (cellDims.cellWidth + cellDims.gapX),
                  top: cellDims.offsetY + y * (cellDims.cellHeight + cellDims.gapY),
                  width: cellDims.cellWidth,
                  height: cellDims.cellHeight,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {!published && !editorState && (
        <button
          type="button"
          onClick={openAdd}
          className="mt-3 flex h-24 w-full items-center justify-center rounded-xl border-2 border-dashed border-black/[.15] text-2xl leading-none text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600 dark:border-white/[.15] dark:hover:border-white/[.35] dark:hover:text-zinc-300 creamsicle:border-orange-300 creamsicle:hover:border-orange-500"
          aria-label="Add widget"
        >
          +
        </button>
      )}

      {!published && editorState && (
        <WidgetEditorPanel
          dashboardId={dashboardId}
          tabId={tabId}
          accounts={accounts}
          categoryOptions={categoryOptions}
          existing={editorState.mode === "edit" ? editorState.widget : undefined}
          ghostLayout={
            isAdding && ghostLayoutItem
              ? { x: ghostLayoutItem.x, y: ghostLayoutItem.y, w: ghostLayoutItem.w, h: ghostLayoutItem.h }
              : undefined
          }
          onClose={closeEditor}
          onDraftChange={setDraft}
          onSaved={() => {
            closeEditor();
            router.refresh();
          }}
        />
      )}
    </>
  );
}
