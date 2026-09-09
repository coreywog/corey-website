import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session";
import { checkLoginLockout, recordFailedLogin, clearLoginAttempts } from "@/lib/loginThrottle";

/** Constant-time string compare, hashed first so lengths always match. */
function safeEqual(a: string, b: string) {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(request: NextRequest) {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminUsername || !adminPassword) {
    throw new Error("ADMIN_USERNAME or ADMIN_PASSWORD env var is not set");
  }

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

  const credentialsValid =
    typeof username === "string" &&
    typeof password === "string" &&
    safeEqual(username, adminUsername) &&
    safeEqual(password, adminPassword);

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
  const token = await createSessionToken();
  const response = NextResponse.redirect(new URL("/dashboards", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions,
    maxAge: sessionMaxAgeSeconds,
  });
  return response;
}
