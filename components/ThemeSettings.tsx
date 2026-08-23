"use client";

import { useTheme } from "@/components/ThemeProvider";
import { THEMES, THEME_LABELS } from "@/lib/theme";

const THEME_PREVIEW: Record<string, { bg: string; accent: string }> = {
  light: { bg: "#ffffff", accent: "#18181b" },
  dark: { bg: "#0a0a0a", accent: "#ededed" },
  creamsicle: { bg: "#fff7ed", accent: "#ea580c" },
};

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const preview = THEME_PREVIEW[t];
        const selected = theme === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            className={
              "flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors " +
              (selected
                ? "border-zinc-900 dark:border-zinc-100 creamsicle:border-orange-500"
                : "border-black/[.08] hover:border-black/[.2] dark:border-white/[.1] dark:hover:border-white/[.3] creamsicle:border-orange-200 creamsicle:hover:border-orange-400")
            }
          >
            <span
              className="flex h-12 w-full items-center justify-center rounded-md border border-black/[.06]"
              style={{ background: preview.bg }}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: preview.accent }} />
            </span>
            <span className="flex items-center justify-between">
              <span className="text-sm font-medium">{THEME_LABELS[t]}</span>
              {selected && (
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 creamsicle:text-orange-600">
                  Active
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
