import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { DashboardList } from "@/components/dashboards/DashboardList";

export default async function DashboardsIndexPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const dashboards = await prisma.dashboard.findMany({
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
