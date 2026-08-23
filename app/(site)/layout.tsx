import Link from "next/link";

const NAV_LINKS = [{ href: "/finance", label: "Finances" }];

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 flex h-dvh w-48 shrink-0 flex-col justify-between border-r border-black/[.08] px-4 py-6 dark:border-white/[.1]">
        <nav className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-2 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-black/[.03] hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/[.05] dark:hover:text-zinc-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <form method="POST" action="/api/auth/logout">
          <button
            type="submit"
            className="rounded-md px-2 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-black/[.03] hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-white/[.05] dark:hover:text-zinc-50"
          >
            Log out
          </button>
        </form>
      </aside>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
