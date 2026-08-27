"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Widget, type WidgetWithData } from "./Widget";
import { WidgetEditorPanel, type ExistingWidget } from "./WidgetEditorPanel";

// Debounced, not fired on every pixel of movement — react-grid-layout's
// onLayoutChange fires continuously during a drag/resize (that's what
// drives the live re-flow), but persisting on every one of those would be
// a request per frame. This just needs to land once the user stops.
const SAVE_DEBOUNCE_MS = 500;

type Account = { id: string; name: string };
type CategoryOption = { category: string; subcategory: string };

export function DashboardGrid({
  dashboardId,
  widgets,
  accounts,
  categoryOptions,
}: {
  dashboardId: string;
  widgets: WidgetWithData[];
  accounts: Account[];
  categoryOptions: CategoryOption[];
}) {
  const router = useRouter();
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1152 });

  function layoutFromWidgets(list: WidgetWithData[]): Layout {
    return list.map((widget) => ({ i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h }));
  }
  const widgetIds = widgets.map((w) => w.id).join(",");
  const [layout, setLayout] = useState<Layout>(() => layoutFromWidgets(widgets));
  // Adjusting state to match a prop change, without an Effect (React's own
  // recommended pattern for this): a router.refresh() after adding/deleting
  // a widget re-renders this same component instance with a new `widgets`
  // prop, but `layout` was only ever seeded once, on mount. Without this,
  // a freshly-added widget has no entry in `layout` at all, so
  // react-grid-layout silently defaults it to 1x1 and then *persists that
  // wrong size back over the correct one* the moment onLayoutChange next
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const persistLayout = useCallback(
    (next: Layout) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      if (next.length === 0) return; // nothing to save — e.g. the last widget was just deleted
      saveTimeout.current = setTimeout(() => {
        fetch(`/api/dashboards/${dashboardId}/layout`, {
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
    [dashboardId],
  );

  function handleLayoutChange(next: Layout) {
    setLayout(next);
    persistLayout(next);
  }

  async function handleDelete(widgetId: string) {
    setDeletingId(widgetId);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditorState({ mode: "add" })}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + Add widget
        </button>
      </div>

      <div ref={containerRef}>
        {mounted && (
          <ReactGridLayout
            layout={layout}
            width={width}
            gridConfig={{ cols: 12, rowHeight: 56, margin: [12, 12] }}
            dragConfig={{ handle: ".widget-drag-handle" }}
            onLayoutChange={handleLayoutChange}
          >
            {widgets.map((widget) => (
              <div key={widget.id} className="group relative">
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
                <Widget widget={widget} />
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>

      {editorState && (
        <WidgetEditorPanel
          dashboardId={dashboardId}
          accounts={accounts}
          categoryOptions={categoryOptions}
          existing={editorState.mode === "edit" ? editorState.widget : undefined}
          onClose={() => setEditorState(null)}
          onSaved={() => {
            setEditorState(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
