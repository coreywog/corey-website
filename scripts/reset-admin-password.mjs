#!/usr/bin/env node
/**
 * Emergency recovery — resets the admin password directly against the
 * database. Only needed if you're ever locked out with no logged-in
 * session to reach Settings' "Change password" form (see
 * components/ChangePasswordForm.tsx, app/api/settings/change-password/
 * route.ts). The password lives in the AdminCredential table now (see
 * prisma/schema.prisma), not the ADMIN_PASSWORD env var — that var is only
 * ever read once, to seed the very first login, so it can't be used to
 * "reset" anything after that.
 *
 * Run with the real DATABASE_URL loaded (same single, shared DB every
 * other script here uses — see docs/sessions for the "single database"
 * gotcha):
 *   set -a && source .env && set +a && node scripts/reset-admin-password.mjs "new-password-here"
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient();

const newPassword = process.argv[2];
if (!newPassword || newPassword.length < 8) {
  console.error("Usage: node scripts/reset-admin-password.mjs <new-password (8+ chars)>");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = await scrypt(newPassword, salt, 64);
const passwordHash = `${salt}:${derived.toString("hex")}`;

const existing = await prisma.adminCredential.findUnique({ where: { id: "singleton" } });
await prisma.adminCredential.upsert({
  where: { id: "singleton" },
  update: { passwordHash },
  // Only hit on a genuinely fresh database with no row yet — falls back to
  // ADMIN_USERNAME so the row this creates still has a real username set.
  create: { id: "singleton", username: process.env.ADMIN_USERNAME ?? "admin", passwordHash },
});

console.log(existing ? "Password reset." : "Password set (no AdminCredential row existed yet — created one).");
await prisma.$disconnect();
