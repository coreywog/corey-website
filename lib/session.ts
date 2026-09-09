import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET env var is not set");
  }
  return new TextEncoder().encode(secret);
}

/** Signs a new admin session token for the given account. Every account
 * gets identical access (see AdminCredential's schema comment) — username
 * is carried purely so Settings' change-password form knows whose
 * password it's changing, not for any permission check. */
export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ role: "admin", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/** Verifies a session token, returning whether it's a valid, unexpired admin session. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.role === "admin";
  } catch {
    // Missing/expired/tampered token — treat as unauthenticated.
    return false;
  }
}

/** The logged-in account's username, or null if the token is missing/
 * invalid/expired — see requireAdminSession's own note on re-verifying
 * rather than trusting proxy.ts alone. */
export async function getSessionUsername(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.role !== "admin" || typeof payload.username !== "string") return null;
    return payload.username;
  } catch {
    return null;
  }
}

/** Cookie options shared between setting (login) and clearing (logout). */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const sessionMaxAgeSeconds = SESSION_MAX_AGE_SECONDS;
