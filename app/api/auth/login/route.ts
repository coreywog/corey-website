import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  sessionCookieOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session";

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

  const formData = await request.formData();
  const username = formData.get("username");
  const password = formData.get("password");

  const credentialsValid =
    typeof username === "string" &&
    typeof password === "string" &&
    safeEqual(username, adminUsername) &&
    safeEqual(password, adminPassword);

  if (!credentialsValid) {
    // On failure, land back on the login path itself — never redirect to
    // "/", or a wrong-password attempt would bounce back to the public WIP
    // placeholder and look like the login path doesn't work at all.
    return NextResponse.redirect(new URL("/quietharbor?error=1", request.url), {
      status: 303,
    });
  }

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
