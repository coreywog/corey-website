"use client";

import { useEffect, useRef } from "react";

/**
 * Mirrors a wide table's horizontal scrollbar at the TOP as well as the
 * browser's own one at the bottom — dragging either one scrolls both
 * (synced via scrollLeft). Without this, reaching the real scrollbar on a
 * table with a lot of rows means scrolling all the way down past every row
 * first just to scroll sideways. A small client island, not a client
 * component itself: a Server Component can render this around a table it
 * builds, same as any other child.
 */
export function ScrollableTable({ children }: { children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const bottom = bottomRef.current;
    const spacer = spacerRef.current;
    if (!bottom || !spacer) return;
    // Keeps the fake top scrollbar's "track" exactly as wide as the real
    // table, including after data loads in or the window resizes — a
    // fixed width computed once at mount would drift out of sync.
    const observer = new ResizeObserver(() => {
      spacer.style.width = `${bottom.scrollWidth}px`;
    });
    observer.observe(bottom);
    return () => observer.disconnect();
  }, []);

  function handleTopScroll() {
    if (syncing.current || !topRef.current || !bottomRef.current) return;
    syncing.current = true;
    bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    syncing.current = false;
  }

  function handleBottomScroll() {
    if (syncing.current || !topRef.current || !bottomRef.current) return;
    syncing.current = true;
    topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    syncing.current = false;
  }

  return (
    <div className="flex flex-col">
      <div
        ref={topRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto overflow-y-hidden border-b border-black/[.06] dark:border-white/[.08]"
        style={{ height: 14 }}
      >
        <div ref={spacerRef} style={{ height: 1 }} />
      </div>
      <div ref={bottomRef} onScroll={handleBottomScroll} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
