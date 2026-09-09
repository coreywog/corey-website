import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// 5 failed attempts within 15 minutes trips a 15-minute lockout for that IP.
// Deliberately generous rather than aggressive — this protects the one
// admin account from casual credential-stuffing bots, not a targeted
// attacker; locking out for hours over a few mistyped passwords would just
// hurt Corey, the only real user.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

/** Best-effort client IP from the standard proxy header Vercel sets — "unknown"
 * (grouped into one shared bucket) for the rare request that has none, e.g.
 * a raw local request. Only the first hop is trusted (a client could forge
 * later entries in the chain, not the first one closest to the edge). */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/** Checks whether this request's IP is currently locked out — call before
 * even looking at the submitted credentials, so a locked-out attacker can't
 * keep using login attempts as a timing/validity oracle. Returns the
 * minutes remaining if locked, or null if the request may proceed. */
export async function checkLoginLockout(request: NextRequest): Promise<number | null> {
  const ip = getClientIp(request);
  const attempt = await prisma.loginAttempt.findUnique({ where: { ip } });
  if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
    return Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60_000);
  }
  return null;
}

/** Records one failed attempt for this request's IP, tripping a lockout once
 * MAX_ATTEMPTS lands within WINDOW_MS. A window that's already expired
 * resets rather than accumulating forever. */
export async function recordFailedLogin(request: NextRequest): Promise<void> {
  const ip = getClientIp(request);
  const now = new Date();
  const existing = await prisma.loginAttempt.findUnique({ where: { ip } });

  const windowExpired = !existing || now.getTime() - existing.windowStart.getTime() > WINDOW_MS;
  const failCount = windowExpired ? 1 : existing.failCount + 1;
  const windowStart = windowExpired ? now : existing.windowStart;
  const lockedUntil = failCount >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;

  await prisma.loginAttempt.upsert({
    where: { ip },
    create: { ip, failCount, windowStart, lockedUntil },
    update: { failCount, windowStart, lockedUntil },
  });
}

/** Clears this request's IP's record entirely on a successful login — a
 * legitimate login means whatever failures preceded it (a few typos, most
 * likely) shouldn't count against future attempts. */
export async function clearLoginAttempts(request: NextRequest): Promise<void> {
  const ip = getClientIp(request);
  await prisma.loginAttempt.deleteMany({ where: { ip } });
}
