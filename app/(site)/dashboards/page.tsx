import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { DashboardList } from "@/components/dashboards/DashboardList";

export default async function DashboardsIndexPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/"); // "/" is the real login screen now — /quietharbor just redirects there
  }
  const username = await getCurrentUsername();
  if (!username) {
    redirect("/"); // stale pre-2026-09-09 session token with no username claim — needs a fresh login
  }

  // This account's own dashboards only — every action this page offers
  // (create, delete-via-click-through) is owner-only anyway, so a
  // dashboard shared with this account has no business showing up here
  // (it's still reachable via the sidebar).
  const dashboards = await prisma.dashboard.findMany({
    where: { ownerUsername: username },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      published: true,
      tabs: { select: { _count: { select: { widgets: true } } } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Create Dashboard</h1>
      <DashboardList
        dashboards={dashboards.map((d) => ({
          id: d.id,
          name: d.name,
          // No single-query way to count a relation's relation (widgets
          // nested two levels under Dashboard) — sum each tab's own count.
          widgetCount: d.tabs.reduce((sum, t) => sum + t._count.widgets, 0),
          published: d.published,
        }))}
      />
    </div>
  );
}
