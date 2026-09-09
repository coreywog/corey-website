#!/usr/bin/env node
/**
 * Adds a new login account directly against the database — there's no
 * self-serve signup (see AdminCredential's schema comment: every account
 * gets identical full access, this is "another key to the same door," not
 * real multi-user support). If no password is given, generates a real
 * random one and prints it once — save it somewhere real (a password
 * manager), it isn't stored anywhere else and can't be recovered, only
 * reset (scripts/reset-admin-password.mjs).
 *
 * Run with the real DATABASE_URL loaded (same single, shared DB every
 * other script here uses):
 *   set -a && source .env && set +a && node scripts/add-account.mjs <username> [password]
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient();

const username = process.argv[2];
let password = process.argv[3];

if (!username) {
  console.error("Usage: node scripts/add-account.mjs <username> [password]");
  console.error("  (omit password to generate a random one)");
  process.exit(1);
}

let generated = false;
if (!password) {
  // 16 random bytes, base64url -- no ambiguous characters, easy to select
  // and paste, ~96 bits of entropy (far more than the 8-character minimum
  // this app otherwise enforces).
  password = randomBytes(16).toString("base64url");
  generated = true;
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const existing = await prisma.adminCredential.findUnique({ where: { username } });
if (existing) {
  console.error(`An account named "${username}" already exists — use scripts/reset-admin-password.mjs to change its password instead.`);
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = await scrypt(password, salt, 64);
const passwordHash = `${salt}:${derived.toString("hex")}`;

await prisma.adminCredential.create({ data: { username, passwordHash } });

console.log(`Account "${username}" created.`);
if (generated) {
  console.log(`Generated password: ${password}`);
  console.log("Save this now -- it isn't stored anywhere else and can't be shown again.");
}
await prisma.$disconnect();
