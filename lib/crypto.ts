import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce size for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY env var is not set");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must decode (base64) to exactly 32 bytes — generate with " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }
  return buf;
}

/**
 * Encrypts arbitrary text for storage — AES-256-GCM, random IV per value.
 * Returns a single base64 string: iv || authTag || ciphertext. Used for
 * anything that shouldn't sit in the database as plaintext: dollar amounts
 * (via encryptAmount below), merchant descriptions, and Plaid access
 * tokens (see app/api/plaid/exchange-token/route.ts) — a credential that
 * lets us pull live bank data, so it gets treated at least as carefully as
 * the financial data itself.
 */
export function encryptText(value: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Encrypts a dollar amount for storage — see encryptText. */
export function encryptAmount(value: number): string {
  return encryptText(String(value));
}

/**
 * Reverses `encryptAmount`/the description-encrypting path in
 * scripts/import-transactions.mjs, returning the original plaintext
 * string. `decryptAmount` below is just this plus a Number() cast.
 */
export function decryptText(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Reverses `encryptAmount`, returning the original number. */
export function decryptAmount(encoded: string): number {
  return Number(decryptText(encoded));
}
