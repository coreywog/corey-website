import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = await scrypt(password, salt, KEY_LENGTH);
  const storedBuf = Buffer.from(hashHex, "hex");
  // Different length already means "wrong" — timingSafeEqual throws rather
  // than returning false on a length mismatch, and a scrypt hash is always
  // KEY_LENGTH bytes anyway unless the stored value is corrupt.
  if (derived.length !== storedBuf.length) return false;
  return timingSafeEqual(derived, storedBuf);
}

/**
 * Seeds the very first account from ADMIN_USERNAME/ADMIN_PASSWORD the
 * first time anything checks credentials against a completely empty
 * table — a schema migration can't do this itself (no access to runtime
 * env vars, and hashing a password is real async work, not a schema
 * change). Every account after that first one is added directly against
 * the database (see scripts/add-account.mjs) — there's still no
 * self-serve signup. Once at least one row exists, this is a no-op
 * forever; the env var is only ever read on that very first check.
 */
async function ensureSeeded(): Promise<void> {
  const count = await prisma.adminCredential.count();
  if (count > 0) return;

  const envUsername = process.env.ADMIN_USERNAME;
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envUsername || !envPassword) {
    throw new Error("ADMIN_USERNAME or ADMIN_PASSWORD env var is not set, and no AdminCredential rows exist yet to seed from");
  }
  const passwordHash = await hashPassword(envPassword);
  // A concurrent request could theoretically lose a create-vs-create race
  // here — extremely unlikely for the very first login ever, and harmless
  // either way since the loser's attempt just becomes a no-op.
  await prisma.adminCredential.create({ data: { username: envUsername, passwordHash } }).catch(() => {});
}

/**
 * The actual login check. Every account gets identical full access (see
 * AdminCredential's own schema comment) — this only tells you *whether*
 * the submitted username+password is a real account, not which one,
 * since nothing downstream distinguishes accounts by permission. Session
 * tokens do carry the username (see lib/session.ts) purely so Settings'
 * change-password form knows whose password it's changing.
 */
export async function verifyLoginCredentials(username: string, password: string): Promise<boolean> {
  await ensureSeeded();
  const cred = await prisma.adminCredential.findUnique({ where: { username } });
  if (!cred) {
    // Run a throwaway hash anyway so a nonexistent username doesn't
    // respond measurably faster than a real one — the same constant-time
    // spirit as hashing before timingSafeEqual elsewhere in this file,
    // just guarding against a username-enumeration timing gap instead of
    // a character-comparison one.
    await verifyPassword(password, await hashPassword(randomBytes(16).toString("hex")));
    return false;
  }
  return verifyPassword(password, cred.passwordHash);
}

/** Settings' "Change password" form — changes the password for whichever
 * account is actually logged in (see lib/auth.ts's getCurrentUsername),
 * never any other account. Requires the current password, not just an
 * active session, so a session left open on a shared computer can't be
 * used to lock the real account holder out. */
export async function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cred = await prisma.adminCredential.findUnique({ where: { username } });
  if (!cred || !(await verifyPassword(currentPassword, cred.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.adminCredential.update({ where: { username }, data: { passwordHash } });
  return { ok: true };
}
