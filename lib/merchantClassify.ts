/**
 * Ported from scripts/extract_statements.py (the Python classifier used for
 * manually-imported statement data) so Plaid-synced transactions get the
 * same merchant categorization instead of landing in "other" wholesale —
 * see lib/plaidSync.ts. This is meant to stay a straight port: if the
 * patterns change in one place, mirror the change in the other.
 */

type SubcategoryPattern = [subcategory: string, pattern: RegExp];

// Best-effort merchant-type classification, built from real merchant
// tokens seen in this data. Only applied to category="spending"
// transactions. First matching pattern wins; anything unmatched falls into
// "other" rather than guessing wrong.
const MERCHANT_CATEGORY_PATTERNS: SubcategoryPattern[] = [
  ["groceries", /whole\s*foods|wholefds|h-e-b|\bheb\b|trader\s*joe|kroger/i],
  // Coffee shops before the general dining pattern — starbucks/desnudo
  // used to fall through to "dining" since that pattern also matched them
  // and came first; keeping this ahead of it is what fixes that.
  [
    "coffee_shop",
    /starbucks|desnudo|la colombe|blank street|\bbsc\b|blue bottle|merit coffee|cafe creme|dunkin|petes coffee|ruta maya/i,
  ],
  [
    "dining",
    /tst\*|thundercloud|torchys|sonic drive|papalote|flo'?s|slice|olive garden|doordash|\bdd\b|grubhub|ubereats/i,
  ],
  ["transport", /lyft|uber(?!eats)|\bnyct\b|transit|parking/i],
  ["gas", /exxon|mobil|texaco|chevron|shell|buc-?ee'?s|conoco|valero/i],
  ["airport", /airport|hudson st\d|\bairp\b/i],
  ["flights", /delta air|southwest|\bairlines\b|\bflight\b/i],
  ["airbnb", /airbnb/i],
  ["hotel", /courtyard|marriott|hilton|\bhotel\b|homewood suit|sheraton/i],
  [
    "subscriptions",
    /hulu|netflix|spotify|crunchyroll|nvidia|epic games|asana|mlb\.?tv|squarespace|google \*|spectrum|comcast|xfinity|apple\.com\/bill/i,
  ],
  ["gym", /la fitness|planet fitness|equinox|\bgym\b|yoga|crossfit/i],
  ["dental", /dentistry|\bdental\b/i],
  ["vision", /zenni|eyecare|eye care|optical/i],
  ["pharmacy", /\bpharmacy\b|\bcvs\b|walgreens/i],
  ["doctor", /\bmedical\b|\bclinic\b|\bdoctor\b|urgent care/i],
  // Specific known insurers — insurance type can't be inferred from
  // generic text, so this only catches carriers seen in real statements.
  ["insurance_auto", /progressive ins|geico|allstate|state farm/i],
  ["insurance_renters", /asi lloyds/i],
  ["phone_internet", /\batt\b|bell south|verizon|t-mobile/i],
  ["electric_water", /city of \w+.*payment|electric|water dept/i],
  ["loans", /bmwfs|bmw bank|auto loan|student loan|mortgage|loan pymt/i],
  ["shopping", /amazon|target\b|bookpeople|walmart|best buy|\bcostco\b/i],
  ["personal_transfer", /venmo|paypal(?! \*)|apple cash|zelle|cash app/i],
  ["personal_care", /cleaners|salon|barber|spa\b/i],
];

// merchantSubcategory -> merchantCategory umbrella. Anything not listed
// here falls back to merchantCategory = merchantSubcategory, i.e. no
// umbrella grouping applied yet.
const SUBCATEGORY_TO_CATEGORY: Record<string, string> = {
  groceries: "food",
  coffee_shop: "food",
  dining: "food",
  transport: "transport",
  gas: "transport",
  airport: "travel",
  flights: "travel",
  airbnb: "travel",
  hotel: "travel",
  subscriptions: "subscriptions",
  gym: "fitness",
  climbing_gym: "fitness",
  supplements: "fitness",
  dental: "health",
  vision: "health",
  pharmacy: "health",
  doctor: "health",
  urgent_care: "health",
  auto: "insurance",
  renters: "insurance",
  phone_internet: "utilities",
  electric_water: "utilities",
  loans: "debt",
  shopping: "shopping",
  personal_transfer: "personal_transfer",
  personal_care: "personal_care",
};

// insurance_auto/insurance_renters exist only to disambiguate by carrier
// name at classification time — the stored merchantSubcategory should just
// read "auto"/"renters" (the category already says "insurance").
const SUBCATEGORY_RENAME: Record<string, string> = {
  insurance_auto: "auto",
  insurance_renters: "renters",
};

function classifyMerchantSubcategory(description: string): string {
  for (const [subcategory, pattern] of MERCHANT_CATEGORY_PATTERNS) {
    if (pattern.test(description)) {
      return SUBCATEGORY_RENAME[subcategory] ?? subcategory;
    }
  }
  return "other";
}

/** Only meaningful for category="spending" — mirrors the Python script's own gating. */
export function classifyMerchant(description: string): { merchantCategory: string; merchantSubcategory: string } {
  const subcategory = classifyMerchantSubcategory(description);
  return { merchantCategory: SUBCATEGORY_TO_CATEGORY[subcategory] ?? subcategory, merchantSubcategory: subcategory };
}
