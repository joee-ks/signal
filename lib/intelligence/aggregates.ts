import type { IntelligenceContext, Transaction } from "./types";

/** Sum of liquid account balances (checking/savings/cash, not archived). */
export function getLiquidBalanceCents(ctx: IntelligenceContext): number {
  return ctx.accounts
    .filter(
      (a) =>
        !a.is_archived && ["checking", "savings", "cash"].includes(a.type),
    )
    .reduce((s, a) => s + (a.current_balance_cents ?? 0), 0);
}

/** "YYYY-MM" key for a date or YYYY-MM-DD string. */
export function monthKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00") : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Bucket totals per month — positive magnitudes. */
export function getMonthlyBuckets(
  txns: Transaction[],
): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  for (const t of txns) {
    const key = monthKey(t.occurred_on);
    if (!result.has(key)) {
      result.set(key, {
        income: 0,
        essential: 0,
        discretionary: 0,
        transfer: 0,
        debt: 0,
      });
    }
    const month = result.get(key)!;
    const bucket = t.bucket;
    if (month[bucket] !== undefined) {
      month[bucket] += Math.abs(t.amount_cents);
    }
  }
  return result;
}

/** Sorted list of complete (non-current) month keys that have transactions. */
export function getCompleteMonths(ctx: IntelligenceContext): string[] {
  const monthly = getMonthlyBuckets(ctx.transactions);
  const current = monthKey(ctx.today);
  return Array.from(monthly.keys())
    .filter((k) => k < current)
    .sort();
}

/**
 * Get the user's monthly income — prefer profile.monthly_income_cents, fall
 * back to averaging the last 3 complete months of `income`-bucket transactions.
 */
export function deriveMonthlyIncome(ctx: IntelligenceContext): number {
  const stated = ctx.profile.monthly_income_cents;
  if (stated != null && stated > 0) return stated;

  const completeMonths = getCompleteMonths(ctx);
  if (completeMonths.length === 0) return 0;
  const monthly = getMonthlyBuckets(ctx.transactions);
  const recent = completeMonths.slice(-3);
  const sum = recent.reduce(
    (s, m) => s + (monthly.get(m)?.income ?? 0),
    0,
  );
  return sum / Math.max(1, recent.length);
}

/**
 * Average monthly total in `bucket` over the last `monthsBack` complete months.
 */
export function avgMonthlyBucket(
  ctx: IntelligenceContext,
  bucket: string,
  monthsBack: number = 3,
): number {
  const completeMonths = getCompleteMonths(ctx);
  if (completeMonths.length === 0) return 0;
  const monthly = getMonthlyBuckets(ctx.transactions);
  const recent = completeMonths.slice(-monthsBack);
  const sum = recent.reduce(
    (s, m) => s + (monthly.get(m)?.[bucket] ?? 0),
    0,
  );
  return sum / Math.max(1, recent.length);
}

/** Day-difference between two YYYY-MM-DD strings or Date objects. */
export function daysBetween(from: Date | string, to: Date | string): number {
  const a = typeof from === "string" ? new Date(from + "T00:00:00") : from;
  const b = typeof to === "string" ? new Date(to + "T00:00:00") : to;
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

/** YYYY-MM-DD string for a Date. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
