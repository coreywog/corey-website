import Link from "next/link";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/resume", label: "Resume" },
  { href: "/gym", label: "Gym" },
];

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-black/[.08] dark:border-white/[.1]">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-semibold tracking-tight">
            Corey Wogenstahl
          </Link>
          <div className="flex gap-6 text-sm font-medium">
            {NAV_LINKS.slice(1).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-black/[.08] px-6 py-6 text-center text-xs text-zinc-500 dark:border-white/[.1] dark:text-zinc-500">
        &copy; {new Date().getFullYear()} Corey Wogenstahl
      </footer>
    </div>
  );
}
