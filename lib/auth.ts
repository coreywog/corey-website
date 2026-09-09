import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, getSessionUsername } from "./session";

/**
 * Re-verifies the admin session cookie. Used both in `app/admin/page.tsx`
 * and inside every mutating route handler — Proxy gating is an optimistic
 * check only, so each handler must independently confirm the session too.
 */
export async function requireAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/** The logged-in account's username, or null if there's no valid session —
 * see app/api/settings/change-password/route.ts, the one place this
 * matters (every other route only cares *whether* someone's logged in,
 * not which account, since every account gets identical access). */
export async function getCurrentUsername(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return getSessionUsername(token);
}
