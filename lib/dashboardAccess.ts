import { prisma } from "@/lib/prisma";

export type DashboardAccess =
  | { allowed: false }
  | { allowed: true; ownerUsername: string; isOwner: boolean };

/**
 * Read access to one dashboard: its owner, or anyone the owner has shared
 * with (AccountShare — see prisma/schema.prisma). Used wherever a
 * dashboard is being *viewed*, not mutated — every mutating route needs
 * requireDashboardOwner below instead, since sharing is view-only.
 */
export async function getDashboardAccess(dashboardId: string, viewerUsername: string): Promise<DashboardAccess> {
  const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId }, select: { ownerUsername: true } });
  if (!dashboard) return { allowed: false };
  if (dashboard.ownerUsername === viewerUsername) {
    return { allowed: true, ownerUsername: dashboard.ownerUsername, isOwner: true };
  }
  const share = await prisma.accountShare.findUnique({
    where: { ownerUsername_viewerUsername: { ownerUsername: dashboard.ownerUsername, viewerUsername } },
  });
  if (!share) return { allowed: false };
  return { allowed: true, ownerUsername: dashboard.ownerUsername, isOwner: false };
}

/**
 * Write access: the dashboard's owner, always — sharing never grants edit/
 * rename/publish/delete, only viewing (see AccountShare's own schema
 * comment). Every mutating dashboard/tab/widget route should reject with
 * a 404 (not 403) when this returns false, matching getDashboardAccess —
 * a dashboard you can't touch should read as "doesn't exist," not "exists
 * but you're forbidden," so nothing leaks that a given id is real.
 */
export async function requireDashboardOwner(dashboardId: string, username: string): Promise<boolean> {
  const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId }, select: { ownerUsername: true } });
  return dashboard?.ownerUsername === username;
}

export type VisibleDashboard = {
  id: string;
  name: string;
  published: boolean;
  ownerUsername: string;
  isOwner: boolean;
  tabs: { id: string; name: string; order: number }[];
};

/**
 * Every dashboard visible to this account — its own, plus anything shared
 * with it — for the sidebar nav (components/nav/DashboardNavList.tsx).
 * Own dashboards first (in their existing order), then shared ones
 * grouped by owner, alphabetically — shared dashboards have no `order`
 * relative to your own to speak of.
 */
export async function listVisibleDashboards(username: string): Promise<VisibleDashboard[]> {
  const [owned, sharedWith] = await Promise.all([
    prisma.dashboard.findMany({
      where: { ownerUsername: username },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, published: true, ownerUsername: true, tabs: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, order: true } } },
    }),
    prisma.dashboard.findMany({
      where: { owner: { sharesGranted: { some: { viewerUsername: username } } } },
      orderBy: [{ ownerUsername: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, published: true, ownerUsername: true, tabs: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, order: true } } },
    }),
  ]);
  return [
    ...owned.map((d) => ({ ...d, isOwner: true })),
    ...sharedWith.map((d) => ({ ...d, isOwner: false })),
  ];
}
