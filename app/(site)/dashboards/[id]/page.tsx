import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { WidgetConfigSchema } from "@/lib/dashboardConfig";
import { computeWidgetData } from "@/lib/dashboardQuery";
import { DashboardTabs } from "@/components/dashboards/DashboardTabs";
import type { WidgetWithData } from "@/components/dashboards/Widget";

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const { id } = await params;
  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    include: {
      tabs: { orderBy: { order: "asc" }, include: { widgets: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!dashboard) {
    notFound();
  }

  // Every widget's config is validated defensively here (not just at write
  // time) — a bad/stale config renders as one broken tile, not a crashed
  // page (see lib/dashboardConfig.ts). The validated config is also handed
  // to the client so the edit panel can open pre-filled. Computed for every
  // tab up front (not just the active one) — dashboards are small enough
  // that this stays cheap, and it means switching tabs is instant with no
  // extra round trip.
  const tabs = await Promise.all(
    dashboard.tabs.map(async (tab) => ({
      id: tab.id,
      name: tab.name,
      widgets: await Promise.all(
        tab.widgets.map(async (row): Promise<WidgetWithData> => {
          const base = { id: row.id, type: row.type, title: row.title, x: row.x, y: row.y, w: row.w, h: row.h };
          const parsed = WidgetConfigSchema.safeParse(row.config);
          if (!parsed.success) {
            return { ...base, config: null, result: { error: "This widget's configuration is out of date." } };
          }
          try {
            return { ...base, config: parsed.data, result: await computeWidgetData(parsed.data) };
          } catch (err) {
            console.error(`Failed to compute widget ${row.id}`, err);
            return { ...base, config: parsed.data, result: { error: "Failed to load this widget." } };
          }
        }),
      ),
    })),
  );

  // Options for the widget editor's filter/category pickers — same source
  // as the Review tab's category picker (app/(site)/finance/review).
  const [accounts, categorized] = await Promise.all([
    prisma.financeAccount.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({
      where: { category: "spending", merchantCategory: { not: null, notIn: ["other"] }, merchantSubcategory: { not: null } },
      select: { merchantCategory: true, merchantSubcategory: true },
      distinct: ["merchantCategory", "merchantSubcategory"],
    }),
  ]);
  const categoryOptions = categorized
    .map((c) => ({ category: c.merchantCategory as string, subcategory: c.merchantSubcategory as string }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{dashboard.name}</h1>
      <DashboardTabs
        dashboardId={dashboard.id}
        tabs={tabs}
        accounts={accounts}
        categoryOptions={categoryOptions}
        initialPublished={dashboard.published}
      />
    </div>
  );
}
