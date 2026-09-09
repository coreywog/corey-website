import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session";
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from "@/lib/loginThrottle";
import { verifyLoginCredentials } from "@/lib/adminCredentials";

export async function POST(request: NextRequest) {
  // Checked before even touching the submitted credentials — a locked-out
  // IP shouldn't get to keep using failed attempts as a timing/validity
  // oracle. See lib/loginThrottle.ts for why this lives in Postgres, not
  // in-memory.
  const lockedMinutes = await checkLoginLockout(request);
  if (lockedMinutes !== null) {
    return NextResponse.redirect(new URL(`/?error=locked&minutes=${lockedMinutes}`, request.url), {
      status: 303,
    });
  }

  const formData = await request.formData();
  const username = formData.get("username");
  const password = formData.get("password");

  // The actual credential check — see lib/adminCredentials.ts. Passwords
  // (and, as of 2026-09-08, more than one account's worth) live in the
  // database, hashed with scrypt, not compared against env vars directly
  // anymore.
  const credentialsValid =
    typeof username === "string" && typeof password === "string" && (await verifyLoginCredentials(username, password));

  if (!credentialsValid) {
    await recordFailedLogin(request);
    // The login form lives directly on "/" now (it used to be hidden at
    // /quietharbor, back when that path's obscurity was the only real
    // access control) — land back there on failure.
    return NextResponse.redirect(new URL("/?error=1", request.url), {
      status: 303,
    });
  }

  await clearLoginAttempts(request);
  // Safe to assert: credentialsValid is only true when username was a
  // string (see the check above).
  const token = await createSessionToken(username as string);
  const response = NextResponse.redirect(new URL("/dashboards", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions,
    maxAge: sessionMaxAgeSeconds,
  });
  return response;
}
