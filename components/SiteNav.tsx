"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const FINANCE_SUBLINKS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/daily", label: "Daily" },
  { href: "/finance/review", label: "Transaction Detail" },
] as const;

const NAV_LINK_CLASSES =
  "rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-800 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950";

const SUBLINK_CLASSES =
  "rounded-md px-2 py-1 text-sm text-zinc-500 transition-colors hover:bg-black/[.03] hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/[.05] dark:hover:text-zinc-50 creamsicle:text-orange-700 creamsicle:hover:bg-orange-100 creamsicle:hover:text-orange-950";

const ACTIVE_SUBLINK_CLASSES =
  "bg-black/[.05] font-medium text-zinc-900 dark:bg-white/[.08] dark:text-zinc-50 creamsicle:bg-orange-100 creamsicle:text-orange-900";

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Site-wide sidebar nav (app/(site)/layout.tsx). Expands to Overview/Daily/
 * Review sub-links while anywhere under /finance, and shows a "needs
 * review" count — next to "Finances" always (visible from anywhere on the
 * site), and again next to "Review" specifically once expanded.
 */
export function SiteNav({ financeNeedsReview }: { financeNeedsReview: number }) {
  const pathname = usePathname();
  const inFinanceSection = pathname.startsWith("/finance");

  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/finance"
        className={`flex items-center gap-1.5 ${NAV_LINK_CLASSES} ${inFinanceSection && pathname === "/finance" ? ACTIVE_SUBLINK_CLASSES : ""}`}
      >
        Finances
        <Badge count={financeNeedsReview} />
      </Link>

      {inFinanceSection && (
        <div className="ml-2 flex flex-col gap-0.5 border-l border-black/[.08] pl-2 dark:border-white/[.1] creamsicle:border-orange-200">
          {FINANCE_SUBLINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 ${SUBLINK_CLASSES} ${active ? ACTIVE_SUBLINK_CLASSES : ""}`}
              >
                {link.label}
                {link.href === "/finance/review" && <Badge count={financeNeedsReview} />}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
