#!/usr/bin/env node
/**
 * Emergency recovery — resets one account's password directly against the
 * database. Only needed if you're ever locked out with no logged-in
 * session to reach Settings' "Change password" form (see
 * components/ChangePasswordForm.tsx, app/api/settings/change-password/
 * route.ts). Passwords live in the AdminCredential table (see
 * prisma/schema.prisma), not an env var — that's only ever read once, to
 * seed the very first account, so it can't be used to "reset" anything
 * after that.
 *
 * Run with the real DATABASE_URL loaded (same single, shared DB every
 * other script here uses — see docs/sessions for the "single database"
 * gotcha):
 *   set -a && source .env && set +a && node scripts/reset-admin-password.mjs <username> "new-password-here"
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient();

const username = process.argv[2];
const newPassword = process.argv[3];
if (!username || !newPassword || newPassword.length < 8) {
  console.error('Usage: node scripts/reset-admin-password.mjs <username> "<new-password (8+ chars)>"');
  process.exit(1);
}

const existing = await prisma.adminCredential.findUnique({ where: { username } });
if (!existing) {
  console.error(`No account named "${username}" exists — use scripts/add-account.mjs to create one instead.`);
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = await scrypt(newPassword, salt, 64);
const passwordHash = `${salt}:${derived.toString("hex")}`;

await prisma.adminCredential.update({ where: { username }, data: { passwordHash } });

console.log(`Password reset for "${username}".`);
await prisma.$disconnect();
