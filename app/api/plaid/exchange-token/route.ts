import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { plaid } from "@/lib/plaid";
import { encryptText } from "@/lib/crypto";

const bodySchema = z.object({ publicToken: z.string().min(1) });

// Plaid's account.type/subtype -> our own FinanceAccount.type/kind scheme
// (see prisma/schema.prisma — kind drives the asset/liability sign).
function mapAccountTypeKind(plaidType: string, plaidSubtype: string | null): { type: string; kind: string } {
  if (plaidType === "depository") {
    if (plaidSubtype === "savings") return { type: "savings", kind: "asset" };
    return { type: "checking", kind: "asset" };
  }
  if (plaidType === "credit") return { type: "credit", kind: "liability" };
  if (plaidType === "loan") return { type: "loan", kind: "liability" };
  if (plaidType === "investment") return { type: "investment", kind: "asset" };
  return { type: "other", kind: "asset" };
}

/**
 * Second step of connecting a bank: Plaid Link's onSuccess callback hands
 * us a short-lived public_token, which we exchange for a permanent
 * access_token (encrypted before it touches the database — see
 * lib/crypto.ts) plus the list of accounts available under this login.
 * Each account becomes its own FinanceAccount, named distinctly from any
 * existing manually-imported account of the same real bank/type so the two
 * don't collide or silently merge — reconciling "this Plaid account is the
 * same real account as that CSV-imported one" is a deliberate later step,
 * not automatic.
 */
export async function POST(request: NextRequest) {
  // Proxy already gates this route, but never trust that alone — re-verify.
  const isAuthed = await requireAdminSession();
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const exchange = await plaid().itemPublicTokenExchange({ public_token: parsed.data.publicToken });
    const accessToken = exchange.data.access_token;
    const itemId = exchange.data.item_id;

    const accountsResponse = await plaid().accountsGet({ access_token: accessToken });
    const institutionName = accountsResponse.data.item.institution_name ?? "Unknown institution";

    const item = await prisma.plaidItem.upsert({
      where: { itemId },
      update: { accessToken: encryptText(accessToken), institutionName },
      create: { itemId, accessToken: encryptText(accessToken), institutionName },
    });

    const accounts = await Promise.all(
      accountsResponse.data.accounts.map(async (a) => {
        const { type, kind } = mapAccountTypeKind(a.type, a.subtype ?? null);
        const displayName = `${institutionName} ${a.name}${a.mask ? ` ...${a.mask}` : ""} (Plaid)`;
        return prisma.financeAccount.upsert({
          where: { plaidAccountId: a.account_id },
          update: { name: displayName, type, kind, plaidItemId: item.id },
          create: {
            name: displayName,
            type,
            kind,
            plaidItemId: item.id,
            plaidAccountId: a.account_id,
          },
        });
      }),
    );

    return NextResponse.json({ institutionName, accountCount: accounts.length });
  } catch (err) {
    console.error("Failed to exchange Plaid public token", err);
    return NextResponse.json({ error: "Failed to connect account" }, { status: 500 });
  }
}
