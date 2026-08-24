type Account = {
  id: string;
  kind: string; // "asset" | "liability"
};

type Entry = {
  accountId: string;
  date: Date;
  balance: number;
};

export type NetWorthPoint = {
  date: string; // YYYY-MM-DD
  netWorth: number;
};

/**
 * Turns sparse per-account balance entries into a net worth series: one
 * point per date that has at least one new balance, forward-filling every
 * other account's most recently known balance so each point reflects the
 * full picture, not just whatever was logged that day.
 */
export function computeNetWorthSeries(
  accounts: Account[],
  entries: Entry[],
): NetWorthPoint[] {
  const kindByAccount = new Map(accounts.map((a) => [a.id, a.kind]));
  const sorted = [...entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const latestByAccount = new Map<string, number>();
  const dates = [...new Set(sorted.map((e) => e.date.toISOString().slice(0, 10)))];

  const points: NetWorthPoint[] = [];
  let cursor = 0;
  for (const date of dates) {
    while (
      cursor < sorted.length &&
      sorted[cursor].date.toISOString().slice(0, 10) === date
    ) {
      latestByAccount.set(sorted[cursor].accountId, sorted[cursor].balance);
      cursor++;
    }

    let netWorth = 0;
    for (const [accountId, balance] of latestByAccount) {
      const kind = kindByAccount.get(accountId);
      netWorth += kind === "liability" ? -balance : balance;
    }
    points.push({ date, netWorth: Math.round(netWorth * 100) / 100 });
  }

  return points;
}

export type MonthlyCashFlow = {
  income: number;
  spending: number;
  net: number;
};

/**
 * Income vs spending for a set of already-month-filtered, already-decrypted
 * transactions. Amounts follow a uniform sign convention regardless of
 * source account: negative = cash outflow, positive = inflow (see
 * scripts/extract_statements.py, which normalizes Amex's opposite raw
 * convention at import time). "other" and "transfer" categories are
 * excluded — transfers are money moving between your own accounts, and
 * "other" inflows are unclassified (not a paycheck), neither reflects
 * actual earned income or discretionary spending.
 */
export function computeMonthlyCashFlow(
  transactions: { amount: number; category: string }[],
): MonthlyCashFlow {
  let income = 0;
  let spending = 0;
  for (const t of transactions) {
    if (t.category === "income") income += t.amount;
    else if (t.category === "spending") spending += -t.amount;
  }
  income = Math.round(income * 100) / 100;
  spending = Math.round(spending * 100) / 100;
  return { income, spending, net: Math.round((income - spending) * 100) / 100 };
}

/** Distinct YYYY-MM months present in a set of transaction dates, newest first. */
export function listAvailableMonths(dates: Date[]): string[] {
  const months = new Set(dates.map((d) => d.toISOString().slice(0, 7)));
  return [...months].sort().reverse();
}

/** UTC [start, end) range for a "YYYY-MM" month string. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

/** Distinct YYYY-MM months present in a set of "YYYY-MM-DD" date strings, newest first. */
export function listAvailableMonthsFromStrings(dates: string[]): string[] {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  return [...months].sort().reverse();
}

/**
 * A chart's time-window choice — either a rolling window ("last N months",
 * anchored to today) or one specific calendar month picked from a dropdown.
 * Shared by DailyCashFlowChart and SpendingExplorer's RangeSelector so both
 * behave identically.
 */
export type DateRangeSelection =
  | { mode: "relative"; months: 1 | 3 | 6 }
  | { mode: "specific"; month: string }; // "YYYY-MM"

/** [start, end) as "YYYY-MM-DD" strings (end exclusive) for a DateRangeSelection. */
export function resolveDateRange(selection: DateRangeSelection): { start: string; end: string } {
  if (selection.mode === "specific") {
    const { start, end } = monthRange(selection.month);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  return {
    start: monthsAgo(selection.months).toISOString().slice(0, 10),
    end: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  };
}

/** "2026-03" -> "March 2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type DailyCashFlowPoint = {
  date: string; // YYYY-MM-DD
  income: number;
  spending: number;
  net: number;
  schwabDeposit: number;
};

/**
 * One point per day that has income, spending, or a Schwab deposit —
 * sparse, not forward-filled, since each day's flow is independent rather
 * than a running total. Schwab deposits ("Schwab Brokerage Moneylink"
 * transactions landing in Chase, category="other" so they never touch the
 * income/spending/net figures) are tracked separately, purely so the trend
 * chart can offer them as an optional overlay — not folded into income,
 * since money moving between your own accounts isn't earned income.
 */
export function computeDailyCashFlow(
  transactions: { date: Date; amount: number; category: string; merchantCategory?: string | null }[],
): DailyCashFlowPoint[] {
  const byDay = new Map<string, { income: number; spending: number; schwabDeposit: number }>();
  for (const t of transactions) {
    const isSchwabDeposit = t.merchantCategory === "schwab";
    if (t.category !== "income" && t.category !== "spending" && !isSchwabDeposit) continue;
    const day = t.date.toISOString().slice(0, 10);
    const bucket = byDay.get(day) ?? { income: 0, spending: 0, schwabDeposit: 0 };
    if (t.category === "income") bucket.income += t.amount;
    else if (t.category === "spending") bucket.spending += -t.amount;
    if (isSchwabDeposit) bucket.schwabDeposit += t.amount;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { income, spending, schwabDeposit }]) => ({
      date,
      income: Math.round(income * 100) / 100,
      spending: Math.round(spending * 100) / 100,
      net: Math.round((income - spending) * 100) / 100,
      schwabDeposit: Math.round(schwabDeposit * 100) / 100,
    }));
}

export type MerchantCategoryTotal = {
  category: string;
  total: number;
};

/**
 * Spending grouped by merchantCategory — the broad umbrella (food,
 * transport, ...), not the finer merchantSubcategory (groceries, dining,
 * ...) — for already-filtered transactions, largest first. Uncategorized
 * spending (merchantCategory null, or transactions predating this feature)
 * falls under "other".
 */
export function computeSpendingByCategory(
  transactions: { amount: number; category: string; merchantCategory: string | null }[],
): MerchantCategoryTotal[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.category !== "spending") continue;
    const key = t.merchantCategory ?? "other";
    totals.set(key, (totals.get(key) ?? 0) + -t.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export type SpendingSubcategoryTotal = {
  subcategory: string;
  total: number;
};

export type SpendingCategoryGroup = {
  category: string;
  total: number;
  subcategories: SpendingSubcategoryTotal[];
};

/**
 * Spending grouped hierarchically — merchantCategory (broad umbrella, e.g.
 * "food") -> merchantSubcategory (fine-grained, e.g. "groceries") -> total —
 * for already-filtered transactions. Categories sorted largest first;
 * subcategories within each category sorted largest first too.
 * Uncategorized spending falls under category "other", subcategory "other".
 */
export function computeSpendingHierarchy(
  transactions: {
    amount: number;
    category: string;
    merchantCategory: string | null;
    merchantSubcategory: string | null;
  }[],
): SpendingCategoryGroup[] {
  const categoryTotals = new Map<string, number>();
  const subcategoryTotals = new Map<string, Map<string, number>>();

  for (const t of transactions) {
    if (t.category !== "spending") continue;
    const category = t.merchantCategory ?? "other";
    const subcategory = t.merchantSubcategory ?? "other";
    const amount = -t.amount;

    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);

    if (!subcategoryTotals.has(category)) subcategoryTotals.set(category, new Map());
    const subMap = subcategoryTotals.get(category)!;
    subMap.set(subcategory, (subMap.get(subcategory) ?? 0) + amount);
  }

  return [...categoryTotals.entries()]
    .map(([category, total]) => {
      const subcategories = [...subcategoryTotals.get(category)!.entries()]
        .map(([subcategory, subTotal]) => ({
          subcategory,
          total: Math.round(subTotal * 100) / 100,
        }))
        .sort((a, b) => b.total - a.total);
      return { category, total: Math.round(total * 100) / 100, subcategories };
    })
    .sort((a, b) => b.total - a.total);
}

/** UTC start of "today minus N months" — for the rolling 6-month window. */
export function monthsAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, now.getUTCDate()));
}

export type MerchantSpendingTotal = {
  merchant: string;
  total: number;
};

// Canonical display name for a specific merchant, collapsing known raw-text
// variants of the same real-world business into one row instead of several
// near-duplicates — e.g. "AplPay WHOLE FOODS MAUSTIN TX" and "AplPay
// WHOLEFDS KBS CHICAGO IL" both -> "Whole Foods". The source description
// text varies per statement/format (store-number suffixes, inconsistent
// spacing from the original PDF/CSV extraction, city/state tags), which
// this list works around case by case rather than trying to fully parse.
// First matching pattern wins.
const MERCHANT_NAME_PATTERNS: [RegExp, string][] = [
  [/whole\s*foods|wholefds/i, "Whole Foods"],
  [/h-?e-?b/i, "H-E-B"],
  [/central\s*marke/i, "Central Market"],
  [/trader\s*joe/i, "Trader Joe's"],
  [/\bkroger\b/i, "Kroger"],
  [/foxtrot\s*marke/i, "Foxtrot Market"],
  [/united\s*dairy\s*farmers/i, "United Dairy Farmers"],

  [/la\s*colombe/i, "La Colombe"],
  [/blank\s*street/i, "Blank Street Coffee"],
  [/ruta\s*maya/i, "Ruta Maya"],
  [/\bbsc\b/i, "Black Sheep Coffee"],
  [/blue\s*bottle/i, "Blue Bottle Coffee"],
  [/merit\s*coffee/i, "Merit Coffee"],
  [/cafe\s*creme/i, "Cafe Creme"],
  [/\bdunkin/i, "Dunkin'"],
  [/petes\s*coffee/i, "Peet's Coffee"],
  [/starbucks/i, "Starbucks"],

  [/\bcava\b/i, "CAVA"],
  [/chick-?fil-?a/i, "Chick-fil-A"],
  [/chipotle/i, "Chipotle"],
  [/p\.?\s*terry'?s/i, "P. Terry's Burger Stand"],
  [/jersey\s*mikes?/i, "Jersey Mike's"],
  [/quizno'?s/i, "Quizno's"],
  [/hunan\s*lion/i, "Hunan Lion"],
  [/kerbey\s*lane/i, "Kerbey Lane Cafe"],
  [/grata'?s\s*pizze?/i, "Grata's Pizzeria"],
  [/noble\s*sandwic/i, "Noble Sandwich Co"],
  [/turf\s*n\s*surf/i, "Turf N Surf Po Boy"],
  [/papalote\s*taco/i, "Papalote Taco House"],
  [/thundercloud/i, "Thundercloud Subs"],
  [/tst\*\s*the\s*sou/i, "The Soup Peddler"],
  [/olamaie/i, "Olamaie"],
  [/little\s*woodrows/i, "Little Woodrow's"],
  [/katy\s*trail\s*ice\s*house/i, "Katy Trail Ice House"],
  [/ghost\s*pepper/i, "Ghost Pepper"],

  [/yogurtland/i, "Yogurtland"],
  [/van\s*leeuwen/i, "Van Leeuwen Ice Cream"],
  [/graeter'?s/i, "Graeter's"],
  [/venchi/i, "Venchi"],
  [/bananarchy/i, "Bananarchy"],
  [/shipley\s*do-?nuts/i, "Shipley Do-Nuts"],
  [/edible\.?com/i, "Edible Arrangements"],
  [/the\s*market\s*#\d+/i, "The Market"],

  [/exxon\s*mobil|exxonmobil/i, "ExxonMobil"],
  [/\bmarathon\b/i, "Marathon"],
  [/love'?s\s*#?\d*/i, "Love's Travel Stop"],
  [/buc-?ee'?s/i, "Buc-ee's"],
  [/circle\s*k/i, "Circle K"],

  [/\blyft\b/i, "Lyft"],
  [/\buber\b(?!eats)/i, "Uber"],

  [/amazon|amzn/i, "Amazon"],
  [/\btarget\b/i, "Target"],
  [/bookpeople/i, "BookPeople"],
  [/officemax|office\s*depot/i, "Office Depot/OfficeMax"],
  [/lowe'?s/i, "Lowe's"],
  [/nordstrom\s*rac/i, "Nordstrom Rack"],
  [/dick'?s\s*sporti/i, "Dick's Sporting Goods"],

  [/avis/i, "Avis"],
  [/homewood\s*suit/i, "Homewood Suites"],
  [/sheraton/i, "Sheraton"],

  [/fsp\*crux\s*clim/i, "Crux Climbing"],
  [/la\s*fitness/i, "LA Fitness"], // matches both the regular and *ANNUALF charge — same membership
  [/gorilla\s*mind/i, "Gorilla Mind"],

  // Subscriptions — PayPal/ACH billing text embeds a different reference
  // number or card ID per charge, which would otherwise fragment one
  // subscription into a separate row per billing cycle (e.g. Spotify
  // showing up 6 times, once per month, each with a different ID).
  // GOOGLE YOUTU and GOOGLE GOOGL are two distinct real subscriptions
  // (YouTube Premium vs YouTube TV) — order matters, more specific first.
  [/google\s*youtu/i, "YouTube Premium"],
  [/google\s*googl/i, "YouTube TV"],
  [/spotify/i, "Spotify"],
  [/\bhulu\b/i, "Hulu"],
  [/crunchyroll/i, "Crunchyroll"],
  [/\bmlb\b/i, "MLB.TV"],
  [/squarespace/i, "Squarespace"],
  [/\basana\b/i, "Asana"],
  [/nvidia/i, "NVIDIA"],
  [/battle\.?net|blizzard/i, "Battle.net"],
  [/epic\s*games/i, "Epic Games"],
  [/twitchinter|\btwitch\b/i, "Twitch"],
  [/\bjagex\b/i, "Jagex"],
  [/scribd/i, "Scribd"],
  [/purchase\s*microsoft|microsoft\s*corp/i, "Microsoft"],
  [/spectrum/i, "Spectrum"],
  [/mashvisor/i, "Mashvisor"],
  [/airdna/i, "AirDNA"],
  [/tapcap/i, "TapCap"],
  [/teazys/i, "Teazys"],
  [/tomofun/i, "TOMOFUN (Furbo)"],
  [/worpenberg/i, "The Worpenberg Foundation"],
];

/**
 * Canonical display name for a raw merchant description — strips the
 * "AplPay " prefix and, for known chains, collapses format variants down
 * to one consistent name (see MERCHANT_NAME_PATTERNS). Anything
 * unrecognized falls back to the trimmed raw text as-is.
 */
export function normalizeMerchantName(raw: string): string {
  const cleaned = raw.replace(/^AplPay\s+/i, "").trim();
  for (const [pattern, canonical] of MERCHANT_NAME_PATTERNS) {
    if (pattern.test(cleaned)) return canonical;
  }
  if (!cleaned) return "Unknown";
  // Fallback for anything not explicitly listed above: strip a long
  // reference-number run (PayPal/ACH transaction IDs, phone numbers) and a
  // trailing 2-letter state code, so at least same-merchant charges that
  // only differ by that noise still collapse into one row instead of a
  // fresh "unique" merchant per billing cycle.
  return cleaned.replace(/\d{6,}.*$/, "").replace(/\s+[A-Z]{2}$/, "").trim() || cleaned;
}

/**
 * Spending grouped by merchant — the finest level available (a specific
 * store/vendor), with known chains normalized to one canonical name (see
 * normalizeMerchantName) so format variants don't fragment into several
 * near-duplicate rows — for already-filtered transactions. Meant to be
 * called after narrowing down to one category+subcategory via
 * computeSpendingHierarchy. Blank/missing descriptions collapse to
 * "Unknown".
 */
export function computeSpendingByMerchant(
  transactions: { amount: number; category: string; description: string | null }[],
): MerchantSpendingTotal[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.category !== "spending") continue;
    const key = t.description ? normalizeMerchantName(t.description) : "Unknown";
    totals.set(key, (totals.get(key) ?? 0) + -t.amount);
  }
  return [...totals.entries()]
    .map(([merchant, total]) => ({ merchant, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

export type SubscriptionStatus = "active" | "likely_cancelled" | "single_charge";

const SUBSCRIPTION_STATUS_ORDER: Record<SubscriptionStatus, number> = {
  active: 0,
  likely_cancelled: 1,
  single_charge: 2,
};

export type RecurringSubscription = {
  merchant: string;
  monthlyAverage: number;
  chargeCount: number;
  lastCharged: string; // YYYY-MM-DD
  monthsCharged: string[]; // "YYYY-MM", every distinct month this merchant billed
  status: SubscriptionStatus;
};

// Categories that hold genuinely subscription/membership-style recurring
// charges — fixed-ish price, billed on a cadence, the kind of thing you'd
// actually consider cancelling. Deliberately not every category: rent,
// utilities, insurance, and taxes also recur on a schedule, but they're
// obligations rather than something to prune, so they're left out of this
// view on purpose rather than by omission.
const RECURRING_ELIGIBLE_CATEGORIES = new Set(["subscriptions", "fitness"]);

/**
 * Recurring subscription/membership merchants (category="spending",
 * merchantCategory one of RECURRING_ELIGIBLE_CATEGORIES — e.g. streaming
 * services as well as a gym membership, but not rent or utilities),
 * normalized (see normalizeMerchantName) and grouped, sorted by monthly
 * cost descending. monthlyAverage divides
 * total spend by the number of distinct months a charge appeared in — not
 * raw charge count — so a merchant billed twice in one month doesn't read
 * as costing double.
 *
 * Also flags a best-effort `status`, purely from the charge history —
 * there's no "cancelled" flag anywhere in the source data, only whether a
 * charge that should have happened by now (given the merchant's own past
 * cadence) didn't:
 *   - "single_charge": only ever billed once in the whole window — could be
 *     a one-time trial, an annual charge that hasn't repeated yet, or a
 *     subscription cancelled right after the first bill. Not enough history
 *     to say more.
 *   - "likely_cancelled": billed on a fairly regular cadence before, but
 *     it's now been well over that typical gap (1.5x) since the last charge
 *     with no new one — a bill that should have landed by now didn't.
 *   - "active": still within its normal cadence. Note this can't detect a
 *     cancellation that happened recently but hasn't yet missed its next
 *     expected billing date — that will show "active" right up until the
 *     gap actually passes, then flip.
 */
export function computeRecurringSubscriptions(
  transactions: {
    date: string;
    amount: number;
    category: string;
    merchantCategory: string | null;
    description: string | null;
  }[],
): RecurringSubscription[] {
  const byMerchant = new Map<
    string,
    { total: number; months: Set<string>; count: number; lastCharged: string; chargeDates: string[] }
  >();
  let asOf = "";
  for (const t of transactions) {
    if (t.date > asOf) asOf = t.date;
    if (t.category !== "spending" || !t.merchantCategory || !RECURRING_ELIGIBLE_CATEGORIES.has(t.merchantCategory)) {
      continue;
    }
    const merchant = t.description ? normalizeMerchantName(t.description) : "Unknown";
    const entry = byMerchant.get(merchant) ?? {
      total: 0,
      months: new Set<string>(),
      count: 0,
      lastCharged: t.date,
      chargeDates: [],
    };
    entry.total += -t.amount;
    entry.months.add(t.date.slice(0, 7));
    entry.count++;
    entry.chargeDates.push(t.date);
    if (t.date > entry.lastCharged) entry.lastCharged = t.date;
    byMerchant.set(merchant, entry);
  }

  return [...byMerchant.entries()]
    .map(([merchant, e]) => {
      const dates = [...e.chargeDates].sort();
      let status: SubscriptionStatus;
      if (dates.length < 2) {
        status = "single_charge";
      } else {
        const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
        gaps.sort((a, b) => a - b);
        const cadence = gaps[Math.floor(gaps.length / 2)]; // median gap
        const sinceLast = daysBetween(e.lastCharged, asOf);
        status = cadence > 0 && sinceLast > cadence * 1.5 ? "likely_cancelled" : "active";
      }
      return {
        merchant,
        monthlyAverage: Math.round((e.total / Math.max(e.months.size, 1)) * 100) / 100,
        chargeCount: e.count,
        lastCharged: e.lastCharged,
        monthsCharged: [...e.months].sort(),
        status,
      };
    })
    // A refund can fully offset a charge and net to $0 (or negative) for
    // the month it happened — not a meaningful "this is what it costs"
    // signal, so it's excluded rather than shown as a $0/mo subscription.
    .filter((s) => s.monthlyAverage > 0)
    // Grouped by status first (active, then likely cancelled, then
    // single-charge) — within each group, the ones charged most
    // consistently (most distinct months) sort to the top, cost as the
    // final tiebreaker.
    .sort((a, b) => {
      const statusDiff = SUBSCRIPTION_STATUS_ORDER[a.status] - SUBSCRIPTION_STATUS_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      const monthsDiff = b.monthsCharged.length - a.monthsCharged.length;
      if (monthsDiff !== 0) return monthsDiff;
      return b.monthlyAverage - a.monthlyAverage;
    });
}

export type WeekdaySpendingPoint = {
  weekday: string; // "Sun" .. "Sat"
  average: number;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Average spending per calendar weekday across [start, end) — total spend
 * on that weekday divided by how many times that weekday actually occurred
 * in the range (not just days with activity), so a quiet Tuesday still
 * pulls the average down instead of being ignored. Dates are "YYYY-MM-DD"
 * strings (UTC, matching every other date string in this module); end is
 * exclusive.
 */
export function computeSpendingByWeekday(
  transactions: { date: string; amount: number; category: string }[],
  start: string,
  end: string,
): WeekdaySpendingPoint[] {
  const totals = new Array(7).fill(0);
  const counts = new Array(7).fill(0);

  for (
    let d = new Date(`${start}T00:00:00Z`);
    d.toISOString().slice(0, 10) < end;
    d = new Date(d.getTime() + 86_400_000)
  ) {
    counts[d.getUTCDay()]++;
  }

  for (const t of transactions) {
    if (t.category !== "spending") continue;
    if (t.date < start || t.date >= end) continue;
    const weekday = new Date(`${t.date}T00:00:00Z`).getUTCDay();
    totals[weekday] += -t.amount;
  }

  return WEEKDAY_LABELS.map((label, i) => ({
    weekday: label,
    average: counts[i] > 0 ? Math.round((totals[i] / counts[i]) * 100) / 100 : 0,
  }));
}

/**
 * The n calendar months immediately before the current one, oldest first,
 * as "YYYY-MM" — excludes the current (in-progress) month. E.g. on Aug 2026,
 * trailingMonths(6) -> ["2026-02", "2026-03", ..., "2026-07"].
 */
export function trailingMonths(n: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// Display-only renames for specific category values — doesn't touch what's
// actually stored (merchantCategory stays "charity" in the DB either way).
const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  charity: "Donations",
};

/** "personal_transfer" -> "Personal transfer"; a few values get a custom display name (see CATEGORY_LABEL_OVERRIDES). */
export function formatCategoryLabel(category: string): string {
  if (CATEGORY_LABEL_OVERRIDES[category]) return CATEGORY_LABEL_OVERRIDES[category];
  const spaced = category.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
