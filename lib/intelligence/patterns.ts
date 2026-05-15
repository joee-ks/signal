import { labelFor } from "@/lib/categories";
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
// 5. Personal-baseline anomaly — this month's category is >2σ above its 6-mo norm
// ----------------------------------------------------------------------------
function detectAnomalies(ctx: IntelligenceContext): Pattern[] {
  const monthly = getMonthlyBuckets(ctx.transactions);
  const months = Array.from(monthly.keys()).sort();
  if (months.length < 3) return [];

  const currentKey = monthKey(ctx.today);

  // Per-category totals per month.
  const catByMonth = new Map<string, Map<string, number>>();
  for (const t of ctx.transactions) {
    if (t.amount_cents >= 0) continue;
    if (t.bucket === "transfer") continue;
    const m = monthKey(t.occurred_on);
    if (!catByMonth.has(m)) catByMonth.set(m, new Map());
    const cm = catByMonth.get(m)!;
    cm.set(t.category, (cm.get(t.category) ?? 0) + Math.abs(t.amount_cents));
  }

  const currentMonth = catByMonth.get(currentKey);
  if (!currentMonth) return [];

  const priorMonths = months.filter((m) => m < currentKey).slice(-6);
  if (priorMonths.length < 2) return [];

  const results: Pattern[] = [];
  for (const [cat, currentCents] of currentMonth) {
    const priorCents = priorMonths.map(
      (m) => catByMonth.get(m)?.get(cat) ?? 0,
    );
    const mean =
      priorCents.reduce((a, b) => a + b, 0) / priorCents.length;
    if (mean < 2000) continue; // ignore tiny categories

    const variance =
      priorCents.reduce((s, c) => s + (c - mean) ** 2, 0) /
      priorCents.length;
    const stdev = Math.sqrt(variance);
    if (stdev === 0) continue;

    const z = (currentCents - mean) / stdev;
    if (z <= 2.0) continue;

    const pctOver = Math.round((currentCents / mean - 1) * 100);
    results.push({
      kind: "anomaly",
      severity: z > 3.0 ? "high" : "watch",
      title: `${labelFor(cat)} is unusually high this month`,
      detail: `$${(currentCents / 100).toFixed(2)} so far vs your typical $${(mean / 100).toFixed(2)}/mo (+${pctOver}%).`,
      evidence: {
        category: cat,
        current_cents: Math.round(currentCents),
        prior_monthly_avg_cents: Math.round(mean),
        z_score: Math.round(z * 10) / 10,
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
