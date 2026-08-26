import { prisma } from "@/lib/prisma";
import { decryptText, decryptAmount } from "@/lib/crypto";

export type MerchantRule = {
  pattern: string;
  exactAmount: number | null;
  merchantCategory: string;
  merchantSubcategory: string;
};

function amountsMatch(a: number, b: number): boolean {
  // Compare in cents to sidestep float rounding (650.3200000000001 etc).
  return Math.round(Math.abs(a) * 100) === Math.round(Math.abs(b) * 100);
}

/**
 * Case-insensitive substring match on description, not a regex — these
 * patterns are user-authored from the Review tab, not developer-authored
 * like lib/merchantClassify.ts's patterns, so no regex metacharacter
 * surprises. A rule with exactAmount set only matches when the amount also
 * matches exactly (e.g. telling a recurring BMW loan payment apart from an
 * occasional BMW service charge that happens to share the merchant name).
 * Among matches, an exact-amount rule wins over a name-only one — it's the
 * more specific correction — and among ties, the longest pattern wins.
 */
export function findRuleMatch(rules: MerchantRule[], description: string, amount: number): MerchantRule | null {
  const lower = description.toLowerCase();
  let best: MerchantRule | null = null;
  for (const rule of rules) {
    if (!lower.includes(rule.pattern.toLowerCase())) continue;
    if (rule.exactAmount !== null && !amountsMatch(rule.exactAmount, amount)) continue;

    if (!best) {
      best = rule;
      continue;
    }
    const ruleIsExact = rule.exactAmount !== null;
    const bestIsExact = best.exactAmount !== null;
    if (ruleIsExact && !bestIsExact) {
      best = rule;
    } else if (ruleIsExact === bestIsExact && rule.pattern.length > best.pattern.length) {
      best = rule;
    }
  }
  return best;
}

/** Loaded once per sync run (lib/plaidSync.ts) rather than per-transaction. */
export async function loadRules(): Promise<MerchantRule[]> {
  return prisma.merchantCategoryRule.findMany({
    select: { pattern: true, exactAmount: true, merchantCategory: true, merchantSubcategory: true },
  });
}

/**
 * Saves (or updates) a rule and immediately re-classifies every existing
 * transaction whose description (and, if set, exact amount) matches it —
 * both are encrypted, so this has to decrypt-and-check per row rather than
 * a SQL query. Only touches category="spending" rows, mirroring
 * lib/merchantClassify.ts's own gating. Returns how many rows were
 * updated, for the UI to report back.
 */
export async function saveRuleAndApply(
  pattern: string,
  merchantCategory: string,
  merchantSubcategory: string,
  exactAmount: number | null = null,
): Promise<number> {
  // Prisma's compound-unique shorthand can't take `null` for exactAmount
  // (SQL unique constraints don't treat NULL as matchable via `=`), so a
  // name-only rule (exactAmount === null) has to be found-then-written by
  // hand instead of the one-line upsert an exact-amount rule can use.
  if (exactAmount === null) {
    const existing = await prisma.merchantCategoryRule.findFirst({ where: { pattern, exactAmount: null } });
    if (existing) {
      await prisma.merchantCategoryRule.update({
        where: { id: existing.id },
        data: { merchantCategory, merchantSubcategory },
      });
    } else {
      await prisma.merchantCategoryRule.create({ data: { pattern, exactAmount, merchantCategory, merchantSubcategory } });
    }
  } else {
    await prisma.merchantCategoryRule.upsert({
      where: { pattern_exactAmount: { pattern, exactAmount } },
      update: { merchantCategory, merchantSubcategory },
      create: { pattern, exactAmount, merchantCategory, merchantSubcategory },
    });
  }

  const candidates = await prisma.transaction.findMany({
    where: { category: "spending", description: { not: null } },
    select: { id: true, description: true, amount: true },
  });

  const lowerPattern = pattern.toLowerCase();
  const matchIds = candidates
    .filter((t) => {
      if (!decryptText(t.description as string).toLowerCase().includes(lowerPattern)) return false;
      if (exactAmount !== null && !amountsMatch(decryptAmount(t.amount), exactAmount)) return false;
      return true;
    })
    .map((t) => t.id);

  if (matchIds.length === 0) return 0;

  const result = await prisma.transaction.updateMany({
    where: { id: { in: matchIds } },
    // Teaching a rule is itself a human confirmation — every transaction it
    // applies to (past and future) counts as reviewed, not just re-guessed.
    data: { merchantCategory, merchantSubcategory, reviewed: true },
  });
  return result.count;
}
