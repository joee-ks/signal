import { isVariableCategory, labelFor } from "@/lib/categories";
import {
  avgMonthlyBucket,
  daysBetween,
  deriveMonthlyIncome,
  getMonthlyBuckets,
  monthKey,
} from "./aggregates";
import type {
  IntelligenceContext,
  Pattern,
  RecurringCharge,
} from "./types";

const SEVERITY_RANK: Record<Pattern["severity"], number> = {
  high: 0,
  watch: 1,
  info: 2,
};

export function detectPatterns(
  ctx: IntelligenceContext,
  recurring: RecurringCharge[],
): Pattern[] {
  const patterns: Pattern[] = [
    ...detectSubscriptionCreep(ctx, recurring),
    ...detectLifestyleInflation(ctx),
    ...detectThousandCuts(ctx),
    ...detectIncomeIrregularity(ctx),
    ...detectAnomalies(ctx),
    ...detectDiscretionaryShare(ctx),
  ];
  patterns.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
  return patterns;
}

// ----------------------------------------------------------------------------
// 1. Subscription creep — a recurring charge that first appeared in last ~35 days
// ----------------------------------------------------------------------------
function detectSubscriptionCreep(
  ctx: IntelligenceContext,
  recurring: RecurringCharge[],
): Pattern[] {
  const results: Pattern[] = [];
  for (const r of recurring) {
    if (r.direction !== "out") continue;
    if (r.cadence !== "monthly" && r.cadence !== "yearly") continue;
    // Suppress variable-spending categories (groceries, dining, coffee,
    // shopping, etc.) — a "monthly recurring" pattern there is almost
    // always a coincidence of two transactions at similar amounts ~30
    // days apart, not a real new subscription.
    if (isVariableCategory(r.category)) continue;
    const since = daysBetween(r.first_seen, ctx.today);
    if (since > 35) continue;

    const dollars = (r.monthly_equivalent_cents / 100).toFixed(2);
    results.push({
      kind: "subscription_creep",
      severity: r.monthly_equivalent_cents > 2000 ? "watch" : "info",
      title: `New recurring charge: ${r.sample_description}`,
      detail: `Started about ${since} day${since === 1 ? "" : "s"} ago — roughly $${dollars}/mo, ${r.cadence}. Worth a sanity-check that you still want it.`,
      evidence: {
        merchant: r.sample_description,
        monthly_cents: r.monthly_equivalent_cents,
        first_seen: r.first_seen,
        cadence: r.cadence,
        days_since_first: since,
      },
    });
  }
  return results;
}

// ----------------------------------------------------------------------------
// 2. Lifestyle inflation — a discretionary category trending up vs baseline
// ----------------------------------------------------------------------------
function detectLifestyleInflation(ctx: IntelligenceContext): Pattern[] {
  const today = ctx.today;
  const t30 = subDays(today, 30);
  const t90 = subDays(today, 90);

  const recent = new Map<string, number>();
  const prior = new Map<string, number>();

  for (const t of ctx.transactions) {
    if (t.bucket !== "discretionary" || t.amount_cents >= 0) continue;
    const d = new Date(t.occurred_on + "T00:00:00");
    const mag = Math.abs(t.amount_cents);
    if (d >= t30) recent.set(t.category, (recent.get(t.category) ?? 0) + mag);
    else if (d >= t90)
      prior.set(t.category, (prior.get(t.category) ?? 0) + mag);
  }

  const results: Pattern[] = [];
  for (const [cat, recentCents] of recent) {
    const priorCents = prior.get(cat) ?? 0;
    const priorMonthly = priorCents / 2; // 60 days → 30
    if (priorMonthly < 2000) continue; // skip tiny categories (< $20/mo baseline)
    if (recentCents < priorMonthly * 1.5) continue; // need >50% growth

    const growthPct = Math.round((recentCents / priorMonthly - 1) * 100);
    results.push({
      kind: "lifestyle_inflation",
      severity: growthPct > 100 ? "high" : "watch",
      title: `${labelFor(cat)} spending is climbing`,
      detail: `$${(recentCents / 100).toFixed(2)} in the last 30 days vs $${(priorMonthly / 100).toFixed(2)}/mo before that (+${growthPct}%).`,
      evidence: {
        category: cat,
        recent_30d_cents: recentCents,
        prior_monthly_cents: Math.round(priorMonthly),
        growth_pct: growthPct,
      },
    });
  }
  return results;
}

// ----------------------------------------------------------------------------
// 3. Thousand cuts — many small discretionary spends adding up
// ----------------------------------------------------------------------------
function detectThousandCuts(ctx: IntelligenceContext): Pattern[] {
  const today = ctx.today;
  const t30 = subDays(today, 30);

  let sum = 0;
  let count = 0;
  for (const t of ctx.transactions) {
    if (t.bucket !== "discretionary" || t.amount_cents >= 0) continue;
    if (new Date(t.occurred_on + "T00:00:00") < t30) continue;
    const mag = Math.abs(t.amount_cents);
    if (mag <= 1500) {
      sum += mag;
      count++;
    }
  }

  const income = deriveMonthlyIncome(ctx);
  if (income <= 0 || sum <= income * 0.1) return [];

  const pct = Math.round((sum / income) * 100);
  return [
    {
      kind: "thousand_cuts",
      severity: sum > income * 0.2 ? "high" : "watch",
      title: "A lot of small spends are adding up",
      detail: `${count} small charges (under $15 each) totaled $${(sum / 100).toFixed(2)} in the last 30 days — about ${pct}% of your monthly income.`,
      evidence: { count, sum_cents: sum, pct_of_income: pct },
    },
  ];
}

// ----------------------------------------------------------------------------
// 4. Income irregularity — paychecks vary > 15%
// ----------------------------------------------------------------------------
function detectIncomeIrregularity(ctx: IntelligenceContext): Pattern[] {
  const today = ctx.today;
  const t90 = subDays(today, 90);

  const incomes = ctx.transactions
    .filter(
      (t) =>
        t.bucket === "income" &&
        new Date(t.occurred_on + "T00:00:00") >= t90,
    )
    .map((t) => t.amount_cents);

  if (incomes.length < 3) return [];

  const mean = incomes.reduce((a, b) => a + b, 0) / incomes.length;
  if (mean <= 0) return [];
  const variance =
    incomes.reduce((s, n) => s + (n - mean) ** 2, 0) / incomes.length;
  const cv = Math.sqrt(variance) / mean;

  if (cv <= 0.15) return [];

  return [
    {
      kind: "income_irregularity",
      severity: cv > 0.3 ? "high" : "watch",
      title: "Your income is variable",
      detail: `Recent income deposits vary by ±${Math.round(cv * 100)}% from your average. Forecasts and runway estimates are less reliable until that smooths out.`,
      evidence: {
        coefficient_of_variation: Math.round(cv * 100) / 100,
        sample_count: incomes.length,
      },
    },
  ];
}

// ----------------------------------------------------------------------------
// 5. Personal-baseline anomaly — cumulative spending by today is >2.5σ above
//    prior months' cumulative spending by the same day-of-month.
//
// Earlier versions of this detector tried to *project* the partial current
// month to a full-month equivalent (either flat day_of_month/days_in_month
// or per-category "learned completion shape"). Both produced false
// positives — the flat version exploded lump-sum recurring categories
// (rent, utilities), and the per-category shape produced noisy projections
// for variable categories with few transactions per month.
//
// This version doesn't project. It just compares apples to apples:
//   - current cumulative spend in category X by day D
//   - prior months' cumulative spend in category X by day D
//
// Lump-sum categories (rent on day 1) have stdev 0 → skipped.
// Variable categories see fair comparison against the same partial window.
// Skipped in days 1–6 because cumulative comparisons are noisy that early.
// ----------------------------------------------------------------------------
function detectAnomalies(ctx: IntelligenceContext): Pattern[] {
  const today = ctx.today;
  const dayOfMonth = today.getDate();
  if (dayOfMonth < 7) return [];

  const monthly = getMonthlyBuckets(ctx.transactions);
  const months = Array.from(monthly.keys()).sort();
  if (months.length < 3) return [];

  const currentKey = monthKey(today);
  const priorMonths = months.filter((m) => m < currentKey).slice(-6);
  if (priorMonths.length < 2) return [];

  // Per-category, per-month list of {day, cents} for both current and prior.
  const catTxns = new Map<
    string,
    Map<string, Array<{ day: number; cents: number }>>
  >();
  for (const t of ctx.transactions) {
    if (t.amount_cents >= 0) continue;
    if (t.bucket === "transfer") continue;
    const m = monthKey(t.occurred_on);
    if (!catTxns.has(t.category)) catTxns.set(t.category, new Map());
    const monthMap = catTxns.get(t.category)!;
    if (!monthMap.has(m)) monthMap.set(m, []);
    monthMap.get(m)!.push({
      day: new Date(t.occurred_on + "T00:00:00").getDate(),
      cents: Math.abs(t.amount_cents),
    });
  }

  const results: Pattern[] = [];
  for (const [cat, monthMap] of catTxns) {
    // Current month's cumulative-by-today.
    const currentByToday = (monthMap.get(currentKey) ?? [])
      .filter((x) => x.day <= dayOfMonth)
      .reduce((s, x) => s + x.cents, 0);
    if (currentByToday === 0) continue;

    // Prior months' cumulative-by-the-same-day-of-month.
    const priorByToday = priorMonths.map((m) =>
      (monthMap.get(m) ?? [])
        .filter((x) => x.day <= dayOfMonth)
        .reduce((s, x) => s + x.cents, 0),
    );

    const mean =
      priorByToday.reduce((a, b) => a + b, 0) / priorByToday.length;
    if (mean < 3000) continue; // ignore tiny categories (< $30 cumulative)

    const variance =
      priorByToday.reduce((s, c) => s + (c - mean) ** 2, 0) /
      priorByToday.length;
    const stdev = Math.sqrt(variance);
    if (stdev === 0) continue;

    const z = (currentByToday - mean) / stdev;
    // 2.5σ rather than 2.0σ to absorb the inherent noise of having only
    // a handful of prior months as the baseline.
    if (z <= 2.5) continue;

    const pctOver = Math.round((currentByToday / mean - 1) * 100);
    results.push({
      kind: "anomaly",
      severity: z > 3.5 ? "high" : "watch",
      title: `${labelFor(cat)} is higher than usual for this point in the month`,
      detail: `$${(currentByToday / 100).toFixed(2)} spent so far vs your typical $${(mean / 100).toFixed(2)} by day ${dayOfMonth} (+${pctOver}%).`,
      evidence: {
        category: cat,
        current_cents_by_today: Math.round(currentByToday),
        prior_avg_cents_by_today: Math.round(mean),
        z_score: Math.round(z * 10) / 10,
        day_of_month: dayOfMonth,
        prior_months_sampled: priorMonths.length,
      },
    });
  }
  return results;
}

// ----------------------------------------------------------------------------
// 6. Discretionary share — discretionary is a big slice of total outflow
// ----------------------------------------------------------------------------
function detectDiscretionaryShare(ctx: IntelligenceContext): Pattern[] {
  const essential = avgMonthlyBucket(ctx, "essential", 3);
  const discretionary = avgMonthlyBucket(ctx, "discretionary", 3);
  const debt = avgMonthlyBucket(ctx, "debt", 3);
  const total = essential + discretionary + debt;
  if (total <= 0) return [];

  const share = discretionary / total;
  if (share <= 0.35) return [];

  return [
    {
      kind: "discretionary_share",
      severity: share > 0.5 ? "high" : "watch",
      title: "Discretionary is a big slice of your outflow",
      detail: `Over the last 3 months, ${Math.round(share * 100)}% of your non-transfer spending was discretionary — about $${(discretionary / 100).toFixed(2)}/mo.`,
      evidence: {
        share_pct: Math.round(share * 100),
        discretionary_monthly_cents: Math.round(discretionary),
        total_monthly_outflow_cents: Math.round(total),
      },
    },
  ];
}

// ----------------------------------------------------------------------------

function subDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - days);
  return out;
}
