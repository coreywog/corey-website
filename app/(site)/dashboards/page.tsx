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
    select: { id: true, name: true, _count: { select: { widgets: true } } },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboards</h1>
      <DashboardList dashboards={dashboards.map((d) => ({ id: d.id, name: d.name, widgetCount: d._count.widgets }))} />
    </div>
  );
}
