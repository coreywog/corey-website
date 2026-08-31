import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { DashboardNavItem } from "./DashboardNavItem";

/**
 * The sidebar's own list of dashboards — every real Dashboard a user has
 * built. Each one pops its tabs (and the publish/delete controls that used
 * to live at the top of the dashboard page) out underneath it while that
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

  const dashboards = await prisma.dashboard.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      published: true,
      // Secondary tiebreaker matters here in a way it didn't before tab
      // reordering existed: tabs created before the `order` column existed
      // can all share its default value, and without a tiebreaker their
      // relative order would be left to whatever Postgres feels like
      // returning for equal keys — not guaranteed stable across queries.
      tabs: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, order: true } },
    },
  });

  return (
    <>
      {dashboards.map((d) => (
        <DashboardNavItem key={d.id} dashboard={d} />
      ))}
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
