import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ThemeSettings } from "@/components/ThemeSettings";
import { ConnectBank } from "@/components/ConnectBank";
import { SyncPlaidButton } from "@/components/SyncPlaidButton";
import { DisconnectPlaidButton } from "@/components/DisconnectPlaidButton";

export default async function SettingsPage() {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    redirect("/quietharbor");
  }

  const plaidItems = await prisma.plaidItem.findMany({
    include: { accounts: { select: { id: true, name: true, archived: true } } },
    orderBy: { createdAt: "asc" },
  });

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
          Linked banks
        </h2>

        {plaidItems.length > 0 && (
          <div className="flex flex-col gap-2">
            {plaidItems.map((item) => (
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
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SyncPlaidButton plaidItemId={item.id} />
                    <DisconnectPlaidButton
                      plaidItemId={item.id}
                      institutionName={item.institutionName ?? "this connection"}
                    />
                  </div>
                </div>
              </div>
            ))}
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
