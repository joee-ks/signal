import type {
  HealthScoreResult,
  IntelligenceContext,
  RecurringCharge,
  SubScore,
  SubScoreKey,
} from "./types";
import {
  avgMonthlyBucket,
  deriveMonthlyIncome,
  getCompleteMonths,
  getLiquidBalanceCents,
  getMonthlyBuckets,
} from "./aggregates";

export const WEIGHTS: Record<SubScoreKey, number> = {
  buffer: 0.25,
  stability: 0.2,
  commitment: 0.2,
  discretionary: 0.2,
  shock: 0.15,
};

export function computeHealthScore(
  ctx: IntelligenceContext,
  recurring: RecurringCharge[],
): HealthScoreResult {
  const sub: Record<SubScoreKey, SubScore> = {
    buffer: scoreBuffer(ctx),
    stability: scoreStability(ctx),
    commitment: scoreCommitment(ctx, recurring),
    discretionary: scoreDiscretionary(ctx),
    shock: scoreShock(ctx),
  };

  // Weighted average of available sub-scores (skip nulls; re-normalize).
  let weightSum = 0;
  let weightedTotal = 0;
  for (const k of Object.keys(WEIGHTS) as SubScoreKey[]) {
    const s = sub[k].score;
    if (s == null) continue;
    weightSum += WEIGHTS[k];
    weightedTotal += s * WEIGHTS[k];
  }
  const total =
    weightSum > 0 ? Math.round(weightedTotal / weightSum) : null;

  return { total, sub_scores: sub, weights: WEIGHTS };
}

/** Liquid balance ÷ avg monthly essential outflow → months of runway. */
function scoreBuffer(ctx: IntelligenceContext): SubScore {
  const liquid = getLiquidBalanceCents(ctx);
  const essential = avgMonthlyBucket(ctx, "essential", 3);
  if (essential <= 0) {
    return { score: null, reason: "Need essential-spending history" };
  }
  if (liquid <= 0) return { score: 0 };

  const months = liquid / essential;
  let score: number;
  if (months <= 3) score = (months / 3) * 70;
  else if (months <= 6) score = 70 + ((months - 3) / 3) * 20;
  else if (months <= 12) score = 90 + ((months - 6) / 6) * 10;
  else score = 100;

  return { score: clamp(Math.round(score)) };
}

/** Coefficient-of-variation of monthly net flow; negative months penalized. */
function scoreStability(ctx: IntelligenceContext): SubScore {
  const months = getCompleteMonths(ctx);
  if (months.length < 2) {
    return { score: null, reason: "Need 2+ complete months" };
  }

  const monthly = getMonthlyBuckets(ctx.transactions);
  const netFlows = months.map((m) => {
    const d = monthly.get(m)!;
    return d.income - (d.essential + d.discretionary + d.debt);
  });

  const positiveCount = netFlows.filter((n) => n >= 0).length;
  const mean = netFlows.reduce((a, b) => a + b, 0) / netFlows.length;
  const variance =
    netFlows.reduce((s, n) => s + (n - mean) ** 2, 0) / netFlows.length;
  const stdev = Math.sqrt(variance);
  const cv = Math.abs(mean) > 0 ? stdev / Math.abs(mean) : 0;

  const base = (positiveCount / netFlows.length) * 100;
  const penalty = Math.min(30, cv * 30);
  return { score: clamp(Math.round(base - penalty)) };
}

/** Monthly recurring commitments as a share of income. */
function scoreCommitment(
  ctx: IntelligenceContext,
  recurring: RecurringCharge[],
): SubScore {
  const income = deriveMonthlyIncome(ctx);
  if (income <= 0) return { score: null, reason: "Set your monthly income" };

  const recurringMonthly = recurring
    .filter((r) => r.direction === "out" && r.bucket !== "transfer")
    .reduce((s, r) => s + r.monthly_equivalent_cents, 0);

  const ratio = recurringMonthly / income;
  let score: number;
  if (ratio <= 0.3) score = 100;
  else if (ratio <= 0.5) score = 100 - ((ratio - 0.3) / 0.2) * 30;
  else if (ratio <= 0.7) score = 70 - ((ratio - 0.5) / 0.2) * 30;
  else if (ratio <= 1.0) score = 40 - ((ratio - 0.7) / 0.3) * 40;
  else score = 0;

  return { score: clamp(Math.round(score)) };
}

/** Last 30 days of discretionary spend vs. the prior 60 days' monthly rate. */
function scoreDiscretionary(ctx: IntelligenceContext): SubScore {
  const today = ctx.today;
  const t30 = subDays(today, 30);
  const t90 = subDays(today, 90);

  let recent = 0;
  let prior = 0;
  for (const t of ctx.transactions) {
    if (t.bucket !== "discretionary" || t.amount_cents >= 0) continue;
    const d = new Date(t.occurred_on + "T00:00:00");
    const mag = Math.abs(t.amount_cents);
    if (d >= t30) recent += mag;
    else if (d >= t90) prior += mag;
  }

  if (prior === 0) {
    if (recent === 0) return { score: 100 };
    return { score: null, reason: "Need 60+ days of history" };
  }

  const priorMonthly = prior / 2; // 60 days → 30
  const ratio = recent / priorMonthly;

  let score: number;
  if (ratio <= 1.0) score = 100;
  else if (ratio <= 1.25) score = 100 - ((ratio - 1.0) / 0.25) * 30;
  else if (ratio <= 1.5) score = 70 - ((ratio - 1.25) / 0.25) * 30;
  else if (ratio <= 2.0) score = 40 - ((ratio - 1.5) / 0.5) * 30;
  else score = 10;

  return { score: clamp(Math.round(score)) };
}

/**
 * "If your income drops 20%, how comfortably does it still cover essentials?"
 *
 * Graduated by the ratio of shock-adjusted income to monthly essentials:
 *   >= 2.0   → 100  (comfortable double coverage)
 *   1.5–2.0  → 80–100
 *   1.0–1.5  → 50–80   (clears but tight)
 *   0.7–1.0  → 20–50   (small shortfall)
 *   < 0.7    → 0–20    (deep shortfall)
 *
 * The previous version returned a flat 100 the moment shock-income cleared
 * essentials by any margin, which made the sub-score uninformative for users
 * whose essentials sat anywhere below 80% of income.
 */
function scoreShock(ctx: IntelligenceContext): SubScore {
  const income = deriveMonthlyIncome(ctx);
  if (income <= 0) return { score: null, reason: "Set your monthly income" };

  const essential = avgMonthlyBucket(ctx, "essential", 3);
  if (essential <= 0) return { score: 100 };

  const shockIncome = income * 0.8;
  const ratio = shockIncome / essential;

  let score: number;
  if (ratio >= 2.0) score = 100;
  else if (ratio >= 1.5) score = 80 + ((ratio - 1.5) / 0.5) * 20;
  else if (ratio >= 1.0) score = 50 + ((ratio - 1.0) / 0.5) * 30;
  else if (ratio >= 0.7) score = 20 + ((ratio - 0.7) / 0.3) * 30;
  else score = (ratio / 0.7) * 20;

  return { score: clamp(Math.round(score)) };
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function subDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() - days);
  return out;
}
