import { prisma } from "@/lib/prisma";
import { decryptAmount, decryptText, encryptText } from "@/lib/crypto";
import { normalizeMerchantName } from "@/lib/finance";

/**
 * General-purpose recurring-charge detection — every spending merchant,
 * not just a curated "subscriptions/fitness" allowlist (see
 * lib/finance.ts's computeRecurringSubscriptions, which still backs a
 * narrower "things worth cancelling" view). This one looks for *any*
 * regular pattern — weekly groceries, biweekly gas, a monthly bill, a
 * yearly renewal — and scores how confident that pattern actually is, so
 * the Data Hub's Recurring panel can flag it for a human to confirm or
 * dismiss instead of asserting it outright.
 */

export const RECURRING_INTERVALS = ["weekly", "biweekly", "monthly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

// Target day-gap and how far off the median gap can be and still count as
// that interval — wide enough to absorb weekends/holidays/billing-date
// drift, narrow enough that "weekly" and "biweekly" don't blur together.
const INTERVAL_BUCKETS: { interval: RecurringInterval; target: number; tolerance: number }[] = [
  { interval: "weekly", target: 7, tolerance: 2 },
  { interval: "biweekly", target: 14, tolerance: 3 },
  { interval: "monthly", target: 30, tolerance: 5 },
  { interval: "yearly", target: 365, tolerance: 15 },
];

// Below this, a group isn't worth surfacing at all — mostly-random timing
// or wildly different amounts each time, not something a human should have
// to actively dismiss.
const MIN_CONFIDENCE = 0.35;
// Fewer than this many charges isn't enough history to call a cadence a
// pattern rather than a coincidence — two charges is just one gap.
const MIN_CHARGE_COUNT = 3;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Coefficient of variation (stdev / mean), the standard way to compare
 * "how spread out" two sets are regardless of their own scale — a $9.99
 * charge wobbling by $0.50 and a $1500 charge wobbling by $75 are equally
 * (in)consistent, 5%, even though the raw dollar spread is wildly
 * different. Returns 0 (perfectly consistent) when every value is
 * identical, since stdev/0 would otherwise be undefined. */
function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance) / Math.abs(m);
}

function classifyInterval(medianGapDays: number): RecurringInterval | null {
  for (const bucket of INTERVAL_BUCKETS) {
    if (Math.abs(medianGapDays - bucket.target) <= bucket.tolerance) return bucket.interval;
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

type Charge = { id: string; date: Date; amount: number };

/**
 * Scores one merchant's charge history — gap regularity and amount
 * regularity averaged together, each expressed as "how tight is the
 * spread relative to the typical value" and inverted so 1.0 means
 * perfectly regular. Gaps matter slightly more than amount (0.6/0.4 split)
 * since a subscription's price can still legitimately change (a plan
 * upgrade, a price hike) without making it any less "recurring" — timing
 * is the stronger signal.
 */
function scoreGroup(charges: Charge[]): { interval: RecurringInterval; confidence: number } | null {
  if (charges.length < MIN_CHARGE_COUNT) return null;
  const sorted = [...charges].sort((a, b) => a.date.getTime() - b.date.getTime());
  const gaps = sorted.slice(1).map((c, i) => daysBetween(sorted[i].date, c.date)).filter((g) => g > 0);
  if (gaps.length === 0) return null;

  const medianGap = median(gaps);
  const interval = classifyInterval(medianGap);
  if (!interval) return null;

  const gapRegularity = Math.max(0, 1 - coefficientOfVariation(gaps));
  const amountRegularity = Math.max(0, 1 - coefficientOfVariation(sorted.map((c) => Math.abs(c.amount))));
  const confidence = Math.round((gapRegularity * 0.6 + amountRegularity * 0.4) * 100) / 100;
  if (confidence < MIN_CONFIDENCE) return null;
  return { interval, confidence };
}

export type RecurringDetectionSummary = {
  groupsCreated: number;
  groupsUpdated: number; // existing pending/confirmed group whose linked transactions changed
  transactionsLinked: number;
};

/**
 * Runs detection across every spending transaction not already in a
 * "dismissed" group (a dismissal is a human's explicit "no, stop
 * suggesting this" and sticks even if the same merchant/cadence keeps
 * showing up — see RecurringGroup's schema comment), grouped by normalized
 * merchant name. For each merchant that still scores above the confidence
 * floor:
 *   - no existing pending/confirmed group for that merchant+interval → a
 *     new "pending" RecurringGroup is created and every matching
 *     transaction linked to it.
 *   - an existing pending/confirmed group already covers it → left alone
 *     (status untouched — a human's confirmation isn't relitigated), but
 *     any newly-imported transaction matching the same merchant is linked
 *     to it so the group stays current as data comes in.
 * A merchant that no longer scores above the floor is left as-is too —
 * this never un-links a transaction or deletes a group on its own; that's
 * a human decision via the dismiss action.
 */
export async function runRecurringDetection(): Promise<RecurringDetectionSummary> {
  const [rows, existingGroups] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        category: "spending",
        account: { excludeFromCashFlow: false },
        recurringGroup: { is: null },
      },
      select: { id: true, date: true, amount: true, description: true },
    }),
    prisma.recurringGroup.findMany({
      where: { status: { in: ["pending", "confirmed"] } },
      select: { id: true, merchantLabel: true, interval: true },
    }),
  ]);

  const existingByKey = new Map(existingGroups.map((g) => [`${decryptText(g.merchantLabel)}:${g.interval}`, g.id]));

  const byMerchant = new Map<string, Charge[]>();
  for (const r of rows) {
    if (!r.description) continue;
    const merchant = normalizeMerchantName(decryptText(r.description));
    const list = byMerchant.get(merchant) ?? [];
    list.push({ id: r.id, date: r.date, amount: decryptAmount(r.amount) });
    byMerchant.set(merchant, list);
  }

  let groupsCreated = 0;
  let groupsUpdated = 0;
  let transactionsLinked = 0;

  for (const [merchant, charges] of byMerchant) {
    const scored = scoreGroup(charges);
    if (!scored) continue;
    const key = `${merchant}:${scored.interval}`;
    const chargeIds = charges.map((c) => c.id);

    const existingId = existingByKey.get(key);
    if (existingId) {
      const { count } = await prisma.transaction.updateMany({
        where: { id: { in: chargeIds }, recurringGroupId: null },
        data: { recurringGroupId: existingId },
      });
      if (count > 0) {
        groupsUpdated++;
        transactionsLinked += count;
      }
      continue;
    }

    const group = await prisma.recurringGroup.create({
      data: {
        merchantLabel: encryptText(merchant),
        interval: scored.interval,
        confidence: scored.confidence,
      },
    });
    await prisma.transaction.updateMany({
      where: { id: { in: chargeIds } },
      data: { recurringGroupId: group.id },
    });
    groupsCreated++;
    transactionsLinked += chargeIds.length;
  }

  return { groupsCreated, groupsUpdated, transactionsLinked };
}

export type RecurringGroupSummary = {
  id: string;
  merchant: string;
  interval: RecurringInterval;
  confidence: number;
  status: "pending" | "confirmed" | "dismissed";
  chargeCount: number;
  averageAmount: number;
  lastCharged: string; // YYYY-MM-DD
};

/** Every group in `status` order (default: just "pending", what the review
 * panel shows), each with its linked charges' summary stats decrypted —
 * merchant label and amounts never leave this function as raw ciphertext. */
export async function listRecurringGroups(statuses: RecurringGroupSummary["status"][] = ["pending"]): Promise<RecurringGroupSummary[]> {
  const groups = await prisma.recurringGroup.findMany({
    where: { status: { in: statuses } },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    include: { transactions: { select: { amount: true, date: true } } },
  });
  return groups
    .map((g) => {
      const amounts = g.transactions.map((t) => Math.abs(decryptAmount(t.amount)));
      const lastCharged = g.transactions.reduce((max, t) => (t.date > max ? t.date : max), g.transactions[0]?.date ?? g.createdAt);
      return {
        id: g.id,
        merchant: decryptText(g.merchantLabel),
        interval: g.interval as RecurringInterval,
        confidence: g.confidence,
        status: g.status as RecurringGroupSummary["status"],
        chargeCount: g.transactions.length,
        averageAmount: amounts.length ? Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100 : 0,
        lastCharged: lastCharged.toISOString().slice(0, 10),
      };
    })
    .filter((g) => g.chargeCount > 0); // a group whose only transactions got reassigned/deleted elsewhere
}
