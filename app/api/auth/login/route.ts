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
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("ADMIN_PASSWORD env var is not set");
  }

  const formData = await request.formData();
  const password = formData.get("password");

  if (typeof password !== "string" || !safeEqual(password, adminPassword)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), {
      status: 303,
    });
  }

  const token = await createSessionToken();
  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...sessionCookieOptions,
    maxAge: sessionMaxAgeSeconds,
  });
  return response;
}
