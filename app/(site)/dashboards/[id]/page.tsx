import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { WidgetConfigSchema, type WidgetType } from "@/lib/dashboardConfig";
import { computeWidgetData } from "@/lib/dashboardQuery";
import { DashboardGrid } from "@/components/dashboards/DashboardGrid";
import type { WidgetWithData } from "@/components/dashboards/Widget";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // Which tab is showing — set by the sidebar's tab links (DashboardNavItem),
  // not local component state, since the sidebar and this page are separate
  // parts of the tree with no other easy way to stay in sync. Omitted means
  // "whichever tab sorts first."
  searchParams: Promise<{ tab?: string }>;
}) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const { id } = await params;
  const { tab: requestedTabId } = await searchParams;

  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    select: {
      id: true,
      published: true,
      // Just enough to pick the active tab and know it's a real one — the
      // sidebar (DashboardNavList) is what actually renders the tab list,
      // and it runs its own query for that.
      tabs: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true } },
    },
  });
  if (!dashboard) {
    notFound();
  }

  const activeTabId = dashboard.tabs.find((t) => t.id === requestedTabId)?.id ?? dashboard.tabs[0]?.id;
  const activeTabRow = activeTabId
    ? await prisma.dashboardTab.findUnique({
        where: { id: activeTabId },
        include: { widgets: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  // Every widget's config is validated defensively here (not just at write
  // time) — a bad/stale config renders as one broken tile, not a crashed
  // page (see lib/dashboardConfig.ts). The validated config is also handed
  // to the client so the edit panel can open pre-filled. Only the active
  // tab's widgets are computed — switching tabs is a real navigation now
  // (see searchParams above), not a client-side swap between
  // already-loaded data, so there's nothing to gain by computing every
  // tab up front the way this used to.
  const widgets: WidgetWithData[] = activeTabRow
    ? await Promise.all(
        activeTabRow.widgets.map(async (row): Promise<WidgetWithData> => {
          const base = { id: row.id, type: row.type, title: row.title, x: row.x, y: row.y, w: row.w, h: row.h };
          const parsed = WidgetConfigSchema.safeParse(row.config);
          if (!parsed.success) {
            return { ...base, config: null, result: { error: "This widget's configuration is out of date." } };
          }
          try {
            return { ...base, config: parsed.data, result: await computeWidgetData(parsed.data, row.type as WidgetType) };
          } catch (err) {
            console.error(`Failed to compute widget ${row.id}`, err);
            return { ...base, config: parsed.data, result: { error: "Failed to load this widget." } };
          }
        }),
      )
    : [];

  // The widget editor's filter/category picker options (accounts,
  // category/subcategory combos, merchant names, saved calculated metrics)
  // used to be fetched right here on every single render of this page —
  // meaning every tab click re-ran them too, even though they're the same
  // regardless of which tab is open, and even on a *published* dashboard
  // where the editor can't even be opened at all. The merchant list alone
  // decrypts every spending transaction's description, real cost that has
  // nothing to do with just looking at a tab. Moved to
  // /api/dashboards/[id]/editor-context, fetched by DashboardGrid on demand
  // the first time the editor actually opens.

  return (
    // The dashboard's name/rename, tabs, publish toggle, and delete all
    // live in the sidebar now (DashboardNavItem) — nothing above the grid
    // here needs to repeat any of it, so this starts right at the top
    // rather than the py-16 every other page on the site uses.
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pt-6 pb-16">
      {activeTabId && (
        <DashboardGrid
          // Remounts on tab switch (a real navigation now) so drag/resize
          // state from the previous tab's grid can't bleed into this one.
          key={activeTabId}
          dashboardId={dashboard.id}
          tabId={activeTabId}
          widgets={widgets}
          published={dashboard.published}
        />
      )}
    </div>
  );
}
