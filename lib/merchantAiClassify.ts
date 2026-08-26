import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var is not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Last-resort merchant classification, only reached when the static
 * classifier (lib/merchantClassify.ts) AND Plaid's own category
 * (lib/plaidCategoryMap.ts) both come up empty — see lib/plaidSync.ts.
 *
 * Only the bare merchant name is ever sent externally — never the amount,
 * date, account, or any other transaction detail. Results are cached in
 * MerchantAiGuess keyed by the lowercased name, so the same merchant is
 * looked up at most once, ever, no matter how many transactions share it.
 *
 * Just as unconfirmed as any other guess — a hit here does not set
 * Transaction.reviewed; the user still confirms it in the Review tab.
 */
export async function classifyMerchantWithAi(
  merchantName: string,
  knownPairs: { category: string; subcategory: string }[],
): Promise<{ merchantCategory: string; merchantSubcategory: string } | null> {
  const key = merchantName.trim().toLowerCase();
  if (!key) return null;

  const cached = await prisma.merchantAiGuess.findUnique({ where: { merchantName: key } });
  if (cached) {
    return { merchantCategory: cached.merchantCategory, merchantSubcategory: cached.merchantSubcategory };
  }

  const examples = [...new Set(knownPairs.map((p) => `${p.category}/${p.subcategory}`))].sort().join(", ");

  let guess: { merchantCategory: string; merchantSubcategory: string } | null = null;
  try {
    const response = await anthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content:
            `Classify this business/merchant name into a personal-finance spending category ` +
            `and subcategory: "${merchantName}"\n\n` +
            `Prefer reusing one of these existing category/subcategory pairs when it reasonably ` +
            `fits: ${examples || "(none yet)"}\n\n` +
            `If nothing fits, invent a short new lowercase snake_case category and subcategory.\n` +
            `Respond with ONLY a JSON object like {"category": "food", "subcategory": "groceries"} ` +
            `and nothing else — no markdown, no explanation.`,
        },
      ],
    });
    const block = response.content[0];
    const text = block?.type === "text" ? block.text.trim() : "";
    const parsed = JSON.parse(text);
    if (typeof parsed.category === "string" && typeof parsed.subcategory === "string") {
      guess = {
        merchantCategory: parsed.category.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        merchantSubcategory: parsed.subcategory.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      };
    }
  } catch (err) {
    console.error(`AI merchant classification failed for "${merchantName}"`, err);
    return null;
  }
  if (!guess) return null;

  // Cache even if another concurrent sync already inserted the same key.
  await prisma.merchantAiGuess
    .upsert({ where: { merchantName: key }, update: {}, create: { merchantName: key, ...guess } })
    .catch(() => {});

  return guess;
}
