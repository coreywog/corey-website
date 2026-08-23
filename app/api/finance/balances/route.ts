import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { encryptAmount } from "@/lib/crypto";

const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "investment",
  "credit",
  "loan",
  "other",
] as const;
const ACCOUNT_KINDS = ["asset", "liability"] as const;

const entrySchema = z
  .object({
    accountId: z.string().min(1).optional(),
    newAccount: z
      .object({
        name: z.string().min(1).max(100),
        type: z.enum(ACCOUNT_TYPES),
        kind: z.enum(ACCOUNT_KINDS),
      })
      .optional(),
    balance: z.number(),
  })
  .refine((entry) => Boolean(entry.accountId) !== Boolean(entry.newAccount), {
    message: "Provide exactly one of accountId or newAccount",
  });

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  entries: z.array(entrySchema).min(1),
});

export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, entries } = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const entry of entries) {
        let accountId = entry.accountId;
        if (!accountId && entry.newAccount) {
          const account = await tx.financeAccount.upsert({
            where: { name: entry.newAccount.name },
            update: {},
            create: {
              name: entry.newAccount.name,
              type: entry.newAccount.type,
              kind: entry.newAccount.kind,
            },
          });
          accountId = account.id;
        }

        const encryptedBalance = encryptAmount(entry.balance);
        const saved = await tx.balanceEntry.upsert({
          where: {
            accountId_date: { accountId: accountId!, date: new Date(date) },
          },
          update: { balance: encryptedBalance },
          create: {
            accountId: accountId!,
            date: new Date(date),
            balance: encryptedBalance,
          },
        });
        results.push(saved);
      }
      return results;
    });

    return NextResponse.json({ count: created.length }, { status: 201 });
  } catch (err) {
    console.error("Failed to save balance entries", err);
    return NextResponse.json(
      { error: "Failed to save entries" },
      { status: 500 },
    );
  }
}
