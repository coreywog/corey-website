// Stable color per top-level merchantCategory, so a category's color never
// shifts between different time ranges or renders. Falls back to a
// deterministic hash into a shared palette for anything not listed here
// (subcategories, merchant names — too many distinct values to hand-pick).
const CATEGORY_COLORS: Record<string, string> = {
  food: "#f97316",
  housing: "#8b5cf6",
  shopping: "#ec4899",
  utilities: "#0ea5e9",
  subscriptions: "#6366f1",
  travel: "#14b8a6",
  taxes: "#64748b",
  health_fitness: "#22c55e",
  debt: "#dc2626",
  transport: "#eab308",
  personal_transfer: "#a855f7",
  insurance: "#0891b2",
  entertainment: "#db2777",
  auto: "#84cc16",
  other: "#71717a",
  charity: "#f43f5e",
  personal_care: "#06b6d4",
  fees: "#94a3b8",
};

const FALLBACK_PALETTE = [
  "#f97316", "#8b5cf6", "#ec4899", "#0ea5e9", "#6366f1", "#14b8a6",
  "#eab308", "#22c55e", "#dc2626", "#a855f7", "#0891b2", "#db2777",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForCategory(category: string): string {
  return CATEGORY_COLORS[category] ?? FALLBACK_PALETTE[hashString(category) % FALLBACK_PALETTE.length];
}

/** Deterministic color for a key with no fixed palette entry (subcategory or merchant name) — same key always gets the same color within a render. */
export function colorForKey(key: string): string {
  return FALLBACK_PALETTE[hashString(key) % FALLBACK_PALETTE.length];
}
