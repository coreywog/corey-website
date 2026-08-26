import Link from "next/link";

const TABS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/daily", label: "Daily" },
  { href: "/finance/review", label: "Transaction Detail" },
] as const;

export function FinanceTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="flex gap-1 border-b border-black/[.08] dark:border-white/[.1]">
      {TABS.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px " +
              (active
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100 creamsicle:border-orange-500 creamsicle:text-orange-700"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-200 creamsicle:text-orange-600 creamsicle:hover:text-orange-800")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
