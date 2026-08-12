import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Corey Wogenstahl",
  description: "Corey Wogenstahl — personal site, resume, and gym progress dashboard.",
};

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/resume", label: "Resume" },
  { href: "/gym", label: "Gym" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
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
      </body>
    </html>
  );
}
