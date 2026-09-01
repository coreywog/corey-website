// Instant loading UI for a dashboard tab — Next.js wraps this route
// segment in a Suspense boundary automatically (the loading.js file
// convention) and shows this the moment a tab link is clicked, streaming
// the real grid in once every widget on the new tab has finished computing
// (see app/(site)/dashboards/[id]/page.tsx — that page has no Suspense
// boundaries of its own, so without this file the browser just sat frozen
// on the old tab until the *entire* new tab's data was ready). This alone
// doesn't make the underlying widget queries faster, but it turns "nothing
// visibly happens for a while" into "the tab switched immediately and the
// tiles are filling in" — the actual complaint being fixed here is the
// felt delay, not (only) the raw query time.
const PLACEHOLDER_TILES = 6;

export default function DashboardLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pt-6 pb-16">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: PLACEHOLDER_TILES }, (_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-xl border border-black/[.08] bg-black/[.03] dark:border-white/[.1] dark:bg-white/[.05] creamsicle:border-orange-200 creamsicle:bg-orange-50/40"
          />
        ))}
      </div>
    </div>
  );
}
