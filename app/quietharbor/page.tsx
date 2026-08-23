export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Corey Wogenstahl
      </h1>
      <form
        method="POST"
        action="/api/auth/login"
        className="flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Username
          </span>
          <input
            type="text"
            name="username"
            autoFocus
            required
            autoComplete="username"
            className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Password
          </span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-black/[.1] bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.15] dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
        </label>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Wrong username or password. Try again.
          </p>
        )}
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Log in
        </button>
      </form>
    </div>
  );
}
