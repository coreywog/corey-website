import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { SiteNav } from "@/components/SiteNav";

const SETTINGS_LINK = { href: "/settings", label: "Settings" };

const NAV_LINK_CLASSES =
  "rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950";

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every route under (site) already requires the admin session (see
  // proxy.ts) — this query is cheap and only ever runs for the one admin
  // user, but skip it rather than trust that alone if somehow unauthenticated.
  const isAuthed = await requireAdminSession();
  const financeNeedsReview = isAuthed
    ? await prisma.transaction.count({ where: { category: "spending", reviewed: false } })
    : 0;

  return (
    <div className="flex min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <aside className="sticky top-0 flex h-dvh w-48 shrink-0 flex-col justify-between border-r border-black/[.08] px-4 py-6 dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/60">
        <SiteNav financeNeedsReview={financeNeedsReview} />
        <div className="flex flex-col gap-1 border-t border-black/[.08] pt-1 dark:border-white/[.1] creamsicle:border-orange-200">
          <Link href={SETTINGS_LINK.href} className={NAV_LINK_CLASSES}>
            {SETTINGS_LINK.label}
          </Link>
          <form method="POST" action="/api/auth/logout">
            <button
              type="submit"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-zinc-500 transition-colors hover:bg-black/[.03] hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-700 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950"
            >
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
