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

/** "2026-03" -> "March 2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
