"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small click-to-open "(i)" button that reveals a short explanation —
 * introduced for the calculated-metric builder, where several concepts
 * (median vs. percentile vs. stddev, what "growth" combines, transaction
 * type vs. merchant category) need a sentence or two each. The app's
 * existing convention for help text is an always-visible `text-[11px]
 * text-zinc-500` line (see CalculatedMetricForm's period-checkbox note),
 * which works for one short, permanent note but doesn't scale to "9
 * aggregation options, each wants its own sentence" without bloating the
 * form — hence a reveal-on-demand control instead, for the option-by-option
 * cases. Click (not hover-only) so it works the same on the mobile builder
 * fallback, where there's no hover at all.
 */
export function InfoTip({ label, children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label ? `More about ${label}` : "More info"}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-black/[.15] text-[10px] leading-none text-zinc-500 hover:border-black/[.3] hover:text-zinc-700 dark:border-white/[.2] dark:text-zinc-400 dark:hover:border-white/[.35] dark:hover:text-zinc-200"
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 top-5 z-40 w-56 -translate-x-1/2 rounded-md border border-black/[.1] bg-[var(--background)] p-2 text-[11px] leading-snug text-zinc-600 shadow-lg dark:border-white/[.15] dark:text-zinc-300">
          {children}
        </span>
      )}
    </span>
  );
}
