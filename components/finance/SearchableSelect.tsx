"use client";

import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

/**
 * A type-to-filter dropdown — replaces a plain <select> for lists long
 * enough that scrolling to find an option (e.g. "parking" buried in 20+
 * transport subcategories) is annoying. Click or focus opens the list;
 * typing filters it by label; clicking an option selects it and closes.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  extraOption,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  /** Appended after the filtered list, always visible (e.g. "+ New category"). */
  extraOption?: Option;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const allOptions = extraOption ? [...options, extraOption] : options;
  const selectedLabel = allOptions.find((o) => o.value === value)?.label ?? "";
  const filtered = query.trim()
    ? allOptions.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : allOptions;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={open ? query : selectedLabel}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            onChange(filtered[0].value);
            setOpen(false);
            setQuery("");
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-black/[.1] bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500"
      />
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-black/[.1] bg-white py-1 shadow-lg dark:border-white/[.15] dark:bg-zinc-900 creamsicle:border-orange-300">
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-zinc-500">No matches</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()} // keep focus so blur doesn't close before click registers
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={
                  "block w-full truncate px-2 py-1.5 text-left text-sm hover:bg-black/[.05] dark:hover:bg-white/[.08] creamsicle:hover:bg-orange-50 " +
                  (o.value === value ? "font-medium" : "")
                }
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
