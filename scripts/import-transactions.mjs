#!/usr/bin/env node
/**
 * Local-only import step. Reads the JSON produced by
 * scripts/extract_statements.py on stdin — {account, date, amount,
 * category, dedupeHash} per transaction, no merchant description — encrypts
 * each amount, and upserts into Postgres via Prisma.
 *
 * Run as:
 *   python3 scripts/extract_statements.py | node scripts/import-transactions.mjs
 *
 * Idempotent: re-running with the same input skips transactions already
 * imported (unique on accountId + dedupeHash), so it's safe to re-run after
 * adding new statement files without double-counting.
 */
import { PrismaClient } from "@prisma/client";
import { createCipheriv, randomBytes } from "crypto";

const prisma = new PrismaClient();

const ACCOUNT_DEFAULTS = {
  "Chase Checking": { type: "checking", kind: "asset" },
  Amex: { type: "credit", kind: "liability" },
};

function encryptAmount(value) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode (base64) to exactly 32 bytes");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    console.error("No input on stdin — pipe extract_statements.py's output in.");
    process.exit(1);
  }
  const { transactions, checksums } = JSON.parse(raw);

  console.log("Checksums:");
  for (const [name, c] of Object.entries(checksums ?? {})) {
    console.log(`  ${name}: ${c.ok ? "OK" : "MISMATCH"} (${c.transaction_count} txns)`);
    if (!c.ok) {
      console.error(
        `Refusing to import — ${name} did not reconcile with its stated ending balance. ` +
          `Fix the parser before importing.`,
      );
      process.exit(1);
    }
  }

  const accountIds = {};
  for (const [name, defaults] of Object.entries(ACCOUNT_DEFAULTS)) {
    const account = await prisma.financeAccount.upsert({
      where: { name },
      update: {},
      create: { name, ...defaults },
    });
    accountIds[name] = account.id;
  }

  let created = 0;
  let skipped = 0;
  for (const txn of transactions) {
    const accountId = accountIds[txn.account];
    if (!accountId) {
      console.error(`Unknown account "${txn.account}" — skipping`);
      continue;
    }
    const existing = await prisma.transaction.findUnique({
      where: {
        accountId_dedupeHash: { accountId, dedupeHash: txn.dedupeHash },
      },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.transaction.create({
      data: {
        accountId,
        date: new Date(txn.date),
        amount: encryptAmount(txn.amount),
        category: txn.category,
        dedupeHash: txn.dedupeHash,
      },
    });
    created++;
  }

  console.log(`\nParsed ${transactions.length} transactions.`);
  console.log(`Created: ${created}, already imported (skipped): ${skipped}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
