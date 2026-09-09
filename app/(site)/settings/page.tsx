import { redirect } from "next/navigation";
import { requireAdminSession, getCurrentUsername } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShareAccessManager } from "@/components/ShareAccessManager";
import { ThemeSettings } from "@/components/ThemeSettings";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { ConnectBank } from "@/components/ConnectBank";
import { SyncPlaidButton } from "@/components/SyncPlaidButton";
import { DisconnectPlaidButton } from "@/components/DisconnectPlaidButton";
import { CalculatedMetricsManager } from "@/components/dashboards/CalculatedMetricsManager";
import { getCalculatedMetricUsage } from "@/lib/dashboardQuery";

export default async function SettingsPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/"); // "/" is the real login screen now — /quietharbor just redirects there
  }
  const username = await getCurrentUsername();
  if (!username) {
    redirect("/"); // stale pre-2026-09-09 session token with no username claim — needs a fresh login
  }

  const [plaidItems, calculatedMetrics, metricUsage, categorized, otherAccounts, sharesGranted, sharesReceived] = await Promise.all([
    prisma.plaidItem.findMany({
      include: { accounts: { select: { id: true, name: true, archived: true, addedByUsername: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.calculatedMetric.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    // Proactively shown next to every metric below, and re-checked before a
    // delete goes through — see getCalculatedMetricUsage's own doc comment
    // for why this is a full-widget scan, not a join.
    getCalculatedMetricUsage(username),
    // Same source as the widget editor's own category picker
    // (app/api/dashboards/[id]/editor-context) — just enough for
    // CalculatedMetricForm's merchant-category scoping, not the full
    // editor-context bundle (accounts, decrypted merchant names) this page
    // has no other use for. Deliberately unscoped by owner — merchant
    // category/subcategory labels alone (never amounts, dates, or account
    // names), consistent with CalculatedMetric staying a shared library.
    prisma.transaction.findMany({
      where: { category: "spending", merchantCategory: { not: null, notIn: ["other"] }, merchantSubcategory: { not: null } },
      select: { merchantCategory: true, merchantSubcategory: true },
      distinct: ["merchantCategory", "merchantSubcategory"],
    }),
    prisma.adminCredential.findMany({ where: { username: { not: username } }, select: { username: true }, orderBy: { username: "asc" } }),
    prisma.accountShare.findMany({ where: { ownerUsername: username }, select: { viewerUsername: true } }),
    prisma.accountShare.findMany({ where: { viewerUsername: username }, select: { ownerUsername: true } }),
  ]);
  const categoryOptions = categorized
    .map((c) => ({ category: c.merchantCategory as string, subcategory: c.merchantSubcategory as string }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Appearance
        </h2>
        <ThemeSettings />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Account
        </h2>
        <ChangePasswordForm />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Shared dashboards
        </h2>
        <p className="-mt-1 text-xs text-zinc-500">
          Your dashboards are private by default. Sharing with another account lets them see (not edit) all of them.
        </p>
        <ShareAccessManager
          otherAccounts={otherAccounts.map((a) => a.username)}
          initialGrantedTo={sharesGranted.map((s) => s.viewerUsername)}
          receivedFrom={sharesReceived.map((s) => s.ownerUsername)}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Calculated metrics
        </h2>
        <p className="-mt-1 text-xs text-zinc-500">
          Saved measures usable as the Metric on any dashboard widget — sums, averages, percentiles, and
          period-over-period comparisons, each optionally scoped to a transaction type or merchant categories.
        </p>
        <CalculatedMetricsManager initialMetrics={calculatedMetrics} categoryOptions={categoryOptions} initialUsage={metricUsage} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-500 creamsicle:text-orange-700">
          Linked banks
        </h2>

        {plaidItems.length > 0 && (
          <div className="flex flex-col gap-2">
            {plaidItems.map((item) => {
              // An item's accounts are always created together in one
              // exchange-token call, so they always share one adder —
              // .every rather than checking just the first is defensive,
              // not because this can actually differ in practice.
              const canManage = item.accounts.length > 0 && item.accounts.every((a) => a.addedByUsername === username);
              const addedBy = item.accounts[0]?.addedByUsername;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-md border border-black/[.08] p-3 dark:border-white/[.1]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{item.institutionName ?? "Unknown institution"}</p>
                      <p className="text-xs text-zinc-500">
                        {item.accounts.filter((a) => !a.archived).map((a) => a.name).join(", ") || "No accounts"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {item.lastSyncedAt ? `Last synced ${item.lastSyncedAt.toLocaleString()}` : "Never synced"}
                        {addedBy && <> · Added by {addedBy === username ? "you" : addedBy}</>}
                      </p>
                    </div>
                    {/* Hidden entirely (not just disabled) for an account
                        that didn't add this item — the server independently
                        re-verifies this too (app/api/plaid/sync/route.ts,
                        app/api/plaid/items/[id]/route.ts), this is just so
                        a button that would just 403 isn't sitting there. */}
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <SyncPlaidButton plaidItemId={item.id} />
                        <DisconnectPlaidButton
                          plaidItemId={item.id}
                          institutionName={item.institutionName ?? "this connection"}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ConnectBank />
        <p className="text-xs text-zinc-500 creamsicle:text-orange-600">
          Uses Plaid — your bank credentials go directly to Plaid&apos;s hosted
          login, never through this site.
        </p>
      </div>
    </div>
  );
}
