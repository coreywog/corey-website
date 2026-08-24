import { prisma } from "@/lib/prisma";
import { decryptText } from "@/lib/crypto";

export type MerchantRule = { pattern: string; merchantCategory: string; merchantSubcategory: string };

/**
 * Case-insensitive substring match, not a regex — these patterns are
 * user-authored from the Review tab (app/(site)/finance/review), not
 * developer-authored like lib/merchantClassify.ts's patterns, so no regex
 * metacharacter surprises. If more than one rule matches, the longest
 * pattern wins (most specific correction beats a broader one).
 */
export function findRuleMatch(rules: MerchantRule[], description: string): MerchantRule | null {
  const lower = description.toLowerCase();
  let best: MerchantRule | null = null;
  for (const rule of rules) {
    if (lower.includes(rule.pattern.toLowerCase())) {
      if (!best || rule.pattern.length > best.pattern.length) best = rule;
    }
  }
  return best;
}

/** Loaded once per sync run (lib/plaidSync.ts) rather than per-transaction. */
export async function loadRules(): Promise<MerchantRule[]> {
  return prisma.merchantCategoryRule.findMany({
    select: { pattern: true, merchantCategory: true, merchantSubcategory: true },
  });
}

/**
 * Saves (or updates) a rule and immediately re-classifies every existing
 * transaction whose description matches it — description is encrypted, so
 * this has to decrypt-and-check per row rather than a SQL LIKE. Only
 * touches category="spending" rows, mirroring lib/merchantClassify.ts's own
 * gating (merchantCategory/Subcategory are only meaningful for spending).
 * Returns how many rows were updated, for the UI to report back.
 */
export async function saveRuleAndApply(
  pattern: string,
  merchantCategory: string,
  merchantSubcategory: string,
): Promise<number> {
  await prisma.merchantCategoryRule.upsert({
    where: { pattern },
    update: { merchantCategory, merchantSubcategory },
    create: { pattern, merchantCategory, merchantSubcategory },
  });

  const candidates = await prisma.transaction.findMany({
    where: { category: "spending", description: { not: null } },
    select: { id: true, description: true },
  });

  const lowerPattern = pattern.toLowerCase();
  const matchIds = candidates
    .filter((t) => decryptText(t.description as string).toLowerCase().includes(lowerPattern))
    .map((t) => t.id);

  if (matchIds.length === 0) return 0;

  const result = await prisma.transaction.updateMany({
    where: { id: { in: matchIds } },
    data: { merchantCategory, merchantSubcategory },
  });
  return result.count;
}
