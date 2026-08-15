import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

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
