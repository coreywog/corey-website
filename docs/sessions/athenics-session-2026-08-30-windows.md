# Athenics Session — 2026-08-30 | Windows

## Completed Today
- Multi-series widgets: per-series quick buttons ("All spending" / "All income" / "Net") next to the category picker — the only way to plot a whole-widget income or net line, since actual merchant categories never include income → ✅ done
- "Date focus buttons" section renamed to "Buttons"; new "Series" toggle-pill row a viewer can turn on to hide/show individual lines/areas/bars on the live tile (client-side only, per-viewer, never touches saved config) → ✅ done
- **New: cumulative (running total) lines.** A "Running total instead of per-day/per-month" checkbox — available for a single-metric widget and per-series in multi-series mode, whenever groupBy is Day/Month — with a basis choice: "Start at 0 for this range" (resets at the window's first bucket) or "Continue from before this range" (carries in every matching transaction before the window as a starting offset) → ✅ done

## Code Changes
- Files modified: `components/dashboards/Widget.tsx`, `components/dashboards/WidgetEditorPanel.tsx`, `lib/dashboardConfig.ts`, `lib/dashboardQuery.ts`
- New files created: none
- No schema/migration changes — `cumulative`/`cumulativeBasis`/`showSeriesToggles` are all-optional `WidgetConfig` JSON fields (`Dashboard`/`DashboardWidget.config` is already a JSON column), nothing added to `prisma/schema.prisma`
- Git commit: see this doc's own commit, pushed to `origin/main` alongside it

## Uncommitted Work
- None — working tree clean aside from the pre-existing untracked dirs outside this project's scope (`app/(site)/dev/records/`, `components/claw/`, `components/records/`, `components/scene/`, `lib/claw/`, `lib/menu/`, `lib/random.ts`, `lib/records/`, `lib/scene/`)

## What's Next
- Cumulative buckets: a day/month with zero matching transactions only gets folded into the running total as an implicit $0 (the running line stays flat through it); it still won't appear at all if *no* series/metric has any data that period, since the x-axis itself is built from whichever buckets have at least one row somewhere. Not an issue for the common case (an active account rarely has a truly empty month) — worth a real fix only if it turns out to bite.
- Not manually verified against real login/data in the browser this session — no auth session available here. Verified via `tsc --noEmit`, `eslint .`, and a full `next build`, all clean, across the whole repo.
- Blockers/notes: none.
