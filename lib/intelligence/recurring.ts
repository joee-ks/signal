import { isVariableCategory } from "@/lib/categories";
import type { Cadence, RecurringCharge, Transaction } from "./types";

/**
 * Normalize a transaction description into a stable merchant key — strips
 * trailing digits, store IDs, common noise. Used to group transactions into
 * candidate recurring charges.
 *
 *   "STARBUCKS STORE 0044"   -> "STARBUCKS STORE"
 *   "AMAZON.COM*MX2H89"      -> "AMAZON COM MX H"
 *   "NETFLIX.COM"            -> "NETFLIX COM"
 */
export function normalizeMerchant(desc: string): string {
  return (desc ?? "")
    .toUpperCase()
    .replace(/\d+/g, " ")
    .replace(/[*#]/g, " ")
    .replace(/[^A-Z &]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

function classifyCadence(
  avgIntervalDays: number,
): { cadence: Cadence; monthlyMultiplier: number } | null {
  if (avgIntervalDays >= 5 && avgIntervalDays <= 9)
    return { cadence: "weekly", monthlyMultiplier: 30 / 7 };
  if (avgIntervalDays >= 12 && avgIntervalDays <= 16)
    return { cadence: "biweekly", monthlyMultiplier: 30 / 14 };
  if (avgIntervalDays >= 25 && avgIntervalDays <= 35)
    return { cadence: "monthly", monthlyMultiplier: 1 };
  if (avgIntervalDays >= 350 && avgIntervalDays <= 380)
    return { cadence: "yearly", monthlyMultiplier: 1 / 12 };
  return null;
}

/**
 * Detect recurring charges in a transaction list. Groups by normalized
 * description; a group is "recurring" if it has 2+ occurrences with a
 * recognizable cadence and consistent amounts (within ±25% of group mean).
 *
 * Returns both money-in (income/paychecks) and money-out (subscriptions, rent,
 * utilities), distinguished by the `direction` field.
 */
export function detectRecurring(txns: Transaction[]): RecurringCharge[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (t.bucket === "transfer") continue;
    // Variable categories (dining, coffee, groceries, shopping, etc.) routinely
    // produce repeat visits to the same merchant at similar amounts — two
    // Chipotle bowls a couple weeks apart shouldnt register as a biweekly
    // recurring charge. Real recurring charges live in the non-variable
    // buckets (subscriptions, utilities, housing, insurance, income).
    if (isVariableCategory(t.category)) continue;
    const key = normalizeMerchant(t.description);
    if (!key) continue;
    const sign = t.amount_cents < 0 ? "out" : "in";
    const groupKey = `${sign}|${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(t);
  }

  const out: RecurringCharge[] = [];
  for (const [groupKey, group] of groups) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) =>
      a.occurred_on.localeCompare(b.occurred_on),
    );

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const d1 = new Date(sorted[i - 1].occurred_on + "T00:00:00");
      const d2 = new Date(sorted[i].occurred_on + "T00:00:00");
      intervals.push(
        (d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000),
      );
    }
    const avgInterval =
      intervals.reduce((a, b) => a + b, 0) / intervals.length;

    const classified = classifyCadence(avgInterval);
    if (!classified) continue;

    const amounts = sorted.map((t) => Math.abs(t.amount_cents));
    const avgAmount =
      amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (avgAmount <= 0) continue;

    // Amount consistency: every observation within ±20% of the group mean.
    // Tighter than 25% to reject random grocery/coffee pairs that happen to
    // land at similar amounts; still loose enough for utility bills with
    // moderate seasonal variation.
    const consistent = amounts.every(
      (a) => Math.abs(a - avgAmount) / avgAmount <= 0.2,
    );
    if (!consistent) continue;

    const [direction] = groupKey.split("|") as ["in" | "out"];
    const last = sorted[sorted.length - 1];
    out.push({
      key: groupKey,
      sample_description: last.description || groupKey,
      typical_amount_cents: Math.round(avgAmount),
      monthly_equivalent_cents: Math.round(
        avgAmount * classified.monthlyMultiplier,
      ),
      cadence: classified.cadence,
      count: sorted.length,
      first_seen: sorted[0].occurred_on,
      last_seen: last.occurred_on,
      category: last.category,
      bucket: last.bucket,
      direction,
    });
  }

  // Highest monthly impact first.
  out.sort(
    (a, b) => b.monthly_equivalent_cents - a.monthly_equivalent_cents,
  );
  return out;
}
