import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { listVisibleDashboards } from "@/lib/dashboardAccess";
import { DashboardNavItem } from "./DashboardNavItem";

/**
 * The sidebar's own list of dashboards — every one this account owns,
 * plus (as of 2026-09-09) any another account has shared with it — see
 * lib/dashboardAccess.ts's listVisibleDashboards. Each one pops its tabs
 * (and, for an owned dashboard, the publish/delete controls that used to
 * live at the top of the dashboard page) out underneath it while that
 * dashboard is the one currently open — see DashboardNavItem, the client
 * component that actually renders each row and knows whether it's active.
 * Deliberately its own small async Server Component rather than fetched in
 * the layout itself: the layout wraps every page on the site, so awaiting
 * this query there would put a DB round-trip in the critical path of every
 * single page load. Rendered inside a <Suspense> boundary (see
 * app/(site)/layout.tsx) so the rest of the sidebar — and the page's own
 * content — paints immediately and this list streams in separately once it
 * resolves.
 */
export async function DashboardNavList() {
  const isAuthed = await requireAdminSession();
  if (!isAuthed) return null;
  const username = await getCurrentUsername();
  if (!username) return null; // stale pre-2026-09-09 session token — the page itself sends these to a fresh login

  const dashboards = await listVisibleDashboards(username);
  const owned = dashboards.filter((d) => d.isOwner);
  const shared = dashboards.filter((d) => !d.isOwner);

  return (
    <>
      {owned.map((d) => (
        <DashboardNavItem key={d.id} dashboard={d} isOwner />
      ))}
      {shared.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <span className="px-2 text-[11px] font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
            Shared with you
          </span>
          {shared.map((d) => (
            <DashboardNavItem key={d.id} dashboard={d} isOwner={false} />
          ))}
        </div>
      )}
    </>
  );
}

/** Static fallback shown while DashboardNavList's query is still in flight. */
export function DashboardNavListFallback() {
  return (
    <div className="flex flex-col gap-1 opacity-50">
      <div className="h-7 rounded-md bg-black/[.04] dark:bg-white/[.06]" />
      <div className="h-7 rounded-md bg-black/[.04] dark:bg-white/[.06]" />
    </div>
  );
}
