"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One row in DashboardNavList — a client component only so it can call
 * usePathname() to know whether it's the currently-open dashboard; the list
 * itself stays a Server Component (its DB query shouldn't block every page
 * load). Same active-row treatment as ReviewSidebar's linkClasses.
 */
export function DashboardNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // Prefix match, not just equality — so "Finances" stays highlighted on
  // /finance/daily and /finance/review too, not just the bare /finance root.
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={
        "rounded-md px-2 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-black/[.05] text-zinc-950 dark:bg-white/[.08] dark:text-zinc-50 creamsicle:bg-orange-100 creamsicle:text-orange-950"
          : "text-zinc-600 hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950")
      }
    >
      {children}
    </Link>
  );
}
