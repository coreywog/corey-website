"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import { gridBounds, minMaxSize, minSize } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Widget, type WidgetWithData } from "./Widget";
import { WidgetEditorPanel, type ExistingWidget, type WidgetDraft } from "./WidgetEditorPanel";
import type { CalculatedMetricOption } from "./types";

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
// Nothing previously stopped a tile from being resized down to 1x1 (or even
// 0 — no per-item minW/minH was ever set, so the library's own default
// minMaxSize constraint had nothing to enforce), which is what let a tile
// shrink small enough for ResponsiveContainer to render a chart sized for a
// stale, larger reading — visually spilling past the now-tiny tile. Kept
// deliberately low (2x2 — six of them still fit across the 12-col grid, the
// actual layout this is meant to allow) rather than picking a size that
// merely "looks comfortable": the chart's own error boundary (Widget.tsx)
// is the backstop for whatever still renders badly at the low end, not this
// constraint. gridBounds and minMaxSize are the library's own defaults (see
// GridLayoutProps' `constraints`); minSize adds this floor on top rather
// than replacing them.
const MIN_TILE_W = 2;
const MIN_TILE_H = 2;
const GRID_CONSTRAINTS = [gridBounds, minMaxSize, minSize(MIN_TILE_W, MIN_TILE_H)];

type Account = { id: string; name: string };
type CategoryOption = { category: string; subcategory: string };

function layoutFromWidgets(list: WidgetWithData[]): Layout {
  // The MIN_TILE_W/H constraint only guards future drags/resizes — it can't
  // retroactively fix a widget that was already saved smaller (from before
  // this floor existed, or from resizeItemInDirection/API calls that don't
  // go through the interactive resize handle at all). Clamping on load
  // means an already-too-small tile grows back up to a renderable size the
  // moment its dashboard is opened, instead of staying broken until someone
  // happens to resize it again.
  return list.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: Math.max(widget.w, MIN_TILE_W),
    h: Math.max(widget.h, MIN_TILE_H),
  }));
}

export function DashboardGrid({
  dashboardId,
  tabId,
  widgets,
  accounts,
  categoryOptions,
  merchantOptions,
  calculatedMetrics,
  published,
}: {
  dashboardId: string;
  tabId: string;
  widgets: WidgetWithData[];
  accounts: Account[];
  categoryOptions: CategoryOption[];
  merchantOptions: string[];
  calculatedMetrics: CalculatedMetricOption[];
  // Dashboard-level, not per-tab (the sidebar's DashboardNavItem owns the
  // publish toggle — see components/nav/) — read fresh off the dashboard
  // page's own server-side fetch and passed straight through here to gate
  // drag/resize and the add/edit/delete controls.
  published: boolean;
}) {
  const router = useRouter();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1152 });

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

  return (
    <>
      <div ref={containerRef} className="relative">
        {mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
            dragConfig={{ enabled: !published, handle: ".widget-drag-handle" }}
            resizeConfig={{ enabled: !published, handles: RESIZE_HANDLES }}
            constraints={GRID_CONSTRAINTS}
            onLayoutChange={handleLayoutChange}
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
          merchantOptions={merchantOptions}
          calculatedMetrics={calculatedMetrics}
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
