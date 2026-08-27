"use client";

import { useCallback, useRef, useState } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Widget, type WidgetWithData } from "./Widget";

// Debounced, not fired on every pixel of movement — react-grid-layout's
// onLayoutChange fires continuously during a drag/resize (that's what
// drives the live re-flow), but persisting on every one of those would be
// a request per frame. This just needs to land once the user stops.
const SAVE_DEBOUNCE_MS = 500;

export function DashboardGrid({ dashboardId, widgets }: { dashboardId: string; widgets: WidgetWithData[] }) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1152 });
  const [layout, setLayout] = useState<Layout>(
    widgets.map((widget) => ({ i: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h })),
  );
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistLayout = useCallback(
    (next: Layout) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
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

  return (
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
            <div key={widget.id}>
              <Widget widget={widget} />
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
