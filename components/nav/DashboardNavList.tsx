import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";

const NAV_LINK_CLASSES =
  "rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950";

/**
 * The sidebar's own list of dashboards — "Finances" (the hand-built
 * Overview/Daily pages) pinned first since it's conceptually just another
 * dashboard even though it isn't a Dashboard row, then every real Dashboard
 * a user has built. Deliberately its own small async Server Component
 * rather than fetched in the layout itself: the layout wraps every page on
 * the site, so awaiting this query there would put a DB round-trip in the
 * critical path of every single page load. Rendered inside a <Suspense>
 * boundary (see app/(site)/layout.tsx) so the rest of the sidebar — and the
 * page's own content — paints immediately and this list streams in
 * separately once it resolves.
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
      <Link href="/finance" className={NAV_LINK_CLASSES}>
        Finances
      </Link>
      {dashboards.map((d) => (
        <Link key={d.id} href={`/dashboards/${d.id}`} className={NAV_LINK_CLASSES}>
          {d.name}
        </Link>
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
