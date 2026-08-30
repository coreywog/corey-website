import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { DashboardNavLink } from "./DashboardNavLink";

/**
 * The sidebar's own list of dashboards — every real Dashboard a user has
 * built. (The original hand-built "Finances" Overview/Daily pages that used
 * to be pinned first here were removed; that data now lives in the
 * dashboard builder and Data Management's Finance tab instead.)
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
    select: { id: true, name: true },
  });

  return (
    <>
      {dashboards.map((d) => (
        <DashboardNavLink key={d.id} href={`/dashboards/${d.id}`}>
          {d.name}
        </DashboardNavLink>
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
