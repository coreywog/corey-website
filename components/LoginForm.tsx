/**
 * The actual login form — shared by app/page.tsx (the real front door as of
 * 2026-09-08) and app/quietharbor/page.tsx (kept only as a redirect for
 * anyone with the old hidden path bookmarked; see that file's own comment).
 * Deliberately no heading/branding/tagline — just the two fields and a
 * button, per Corey's own call; the joke lives entirely in the backdrop
 * (see LoginBackdrop.tsx) instead of being spelled out here. `error` comes
 * straight from the ?error= search param app/api/auth/login/route.ts
 * redirects back with: "1" for a wrong username/password, "locked" (with
 * `minutes`) once lib/loginThrottle.ts trips the failed-attempt lockout for
 * this IP.
 */
export function LoginForm({ error, minutes }: { error?: string; minutes?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-black/[.08] bg-[var(--background)]/90 p-8 shadow-xl backdrop-blur-md dark:border-white/[.1] creamsicle:border-orange-200">
      <form method="POST" action="/api/auth/login" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 creamsicle:text-orange-800">Username</span>
          <input
            type="text"
            name="username"
            autoFocus
            required
            autoComplete="username"
            className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400 creamsicle:text-orange-800">Password</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500 creamsicle:border-orange-300 creamsicle:focus:border-orange-500"
          />
        </label>
        {error === "locked" ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Too many attempts — try again in {minutes ?? "a few"} minute{minutes === "1" ? "" : "s"}.
          </p>
        ) : (
          error && <p className="text-sm text-red-600 dark:text-red-400">Wrong username or password. Try again.</p>
        )}
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300 creamsicle:bg-orange-600 creamsicle:hover:bg-orange-700"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
