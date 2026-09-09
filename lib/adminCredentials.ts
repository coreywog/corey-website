import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const SINGLETON_ID = "singleton";
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

/** Constant-time string compare, hashed first so lengths always match —
 * same trick the login route used before credentials moved into the DB. */
function safeEqualStrings(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Lazily seeds the one AdminCredential row from ADMIN_USERNAME/
 * ADMIN_PASSWORD the first time anything asks for it — a schema migration
 * can't do this itself (it has no access to runtime env vars, and hashing
 * a password is real async work, not a schema change). Every login after
 * the first goes through this DB row alone; changing the password via
 * Settings never touches the env var again, and the env var is only ever
 * read here, exactly once, unless the row is ever deleted.
 */
async function getOrSeedCredential() {
  const existing = await prisma.adminCredential.findUnique({ where: { id: SINGLETON_ID } });
  if (existing) return existing;

  const envUsername = process.env.ADMIN_USERNAME;
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envUsername || !envPassword) {
    throw new Error("ADMIN_USERNAME or ADMIN_PASSWORD env var is not set, and no AdminCredential row exists yet to seed from");
  }
  const passwordHash = await hashPassword(envPassword);
  // Someone else's concurrent request could theoretically lose this race
  // and hit a unique-constraint error on create — extremely unlikely for a
  // single-admin app's first-ever login, and falling back to a fresh
  // lookup handles it if it ever happens.
  return prisma.adminCredential
    .create({ data: { id: SINGLETON_ID, username: envUsername, passwordHash } })
    .catch(() => prisma.adminCredential.findUniqueOrThrow({ where: { id: SINGLETON_ID } }));
}

/** The actual login check — replaces the old direct env-var comparison. */
export async function verifyLoginCredentials(username: string, password: string): Promise<boolean> {
  const cred = await getOrSeedCredential();
  if (!safeEqualStrings(username, cred.username)) return false;
  return verifyPassword(password, cred.passwordHash);
}

/** Changing the password from Settings — requires the current one, same as
 * every other "change password" flow, so a session left open on a shared
 * computer can't be used to lock the real admin out. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cred = await getOrSeedCredential();
  if (!(await verifyPassword(currentPassword, cred.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.adminCredential.update({ where: { id: SINGLETON_ID }, data: { passwordHash } });
  return { ok: true };
}
