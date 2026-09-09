import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { LoginBackdrop } from "@/components/LoginBackdrop";
import { LoginForm } from "@/components/LoginForm";

/**
 * The real front door, as of 2026-09-08 — "/" used to be a deliberately
 * bare "work in progress" placeholder with the actual login form hidden at
 * an unlisted path (see app/quietharbor/page.tsx, now just a redirect
 * here), so nothing ever hinted a real site existed behind it. That
 * obscurity was traded away on purpose for a login screen that's actually
 * memorable to visit — see lib/loginThrottle.ts for the failed-attempt
 * rate limiting that replaces it as the real access control.
 *
 * proxy.ts exempts "/" from its auth check unconditionally (it has to —
 * that's exactly what makes this reachable while logged out), so an
 * already-logged-in visit has to be handled here instead: straight on to
 * the dashboards rather than showing the login form again.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; minutes?: string }>;
}) {
  if (await requireAdminSession()) {
    redirect("/dashboards");
  }

  const { error, minutes } = await searchParams;

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-[var(--background)] px-6">
      <LoginBackdrop />
      <div className="relative z-10">
        <LoginForm error={error} minutes={minutes} />
      </div>
    </div>
  );
}
