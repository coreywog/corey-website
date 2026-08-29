import { Suspense } from "react";
import Link from "next/link";
import { DashboardNavList, DashboardNavListFallback } from "@/components/nav/DashboardNavList";

const BOTTOM_LINKS = [
  { href: "/data-hub", label: "Data Management Hub" },
  { href: "/settings", label: "Settings" },
];

const NAV_LINK_CLASSES =
  "rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full bg-[var(--background)] text-[var(--foreground)]">
      <aside className="sticky top-0 flex h-dvh w-48 shrink-0 flex-col justify-between border-r border-black/[.08] px-4 py-6 dark:border-white/[.1] creamsicle:border-orange-200 creamsicle:bg-orange-50/60">
        <nav className="flex flex-col gap-1">
          <Link
            href="/dashboards"
            className={NAV_LINK_CLASSES + " flex items-center justify-between"}
          >
            Create Dashboard
            <span aria-hidden="true">+</span>
          </Link>
          <hr className="my-1 border-black/[.08] dark:border-white/[.1] creamsicle:border-orange-200" />
          <Suspense fallback={<DashboardNavListFallback />}>
            <DashboardNavList />
          </Suspense>
        </nav>
        <div className="flex flex-col gap-1 border-t border-black/[.08] pt-1 dark:border-white/[.1] creamsicle:border-orange-200">
          {BOTTOM_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={NAV_LINK_CLASSES}>
              {link.label}
            </Link>
          ))}
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
