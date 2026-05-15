import {
  avgMonthlyBucket,
  deriveMonthlyIncome,
  getCompleteMonths,
  getLiquidBalanceCents,
  getMonthlyBuckets,
} from "./aggregates";
import { computeForecast } from "./forecast";
import { computeHealthScore } from "./health-score";
import { detectPatterns } from "./patterns";
import { detectRecurring } from "./recurring";
import type { IntelligenceContext, IntelligenceResult } from "./types";

export * from "./types";

/**
 * Top-level orchestrator. Pure: given a context, returns the full
 * intelligence snapshot. The dashboard calls this on every render (it's
 * fast — single-pass over the user's transactions).
 */
export function computeIntelligence(
  ctx: IntelligenceContext,
): IntelligenceResult {
  const recurring = detectRecurring(ctx.transactions);
  const health = computeHealthScore(ctx, recurring);
  const patterns = detectPatterns(ctx, recurring);
  const forecast = computeForecast(ctx);

  const monthly = getMonthlyBuckets(ctx.transactions);
  const complete = getCompleteMonths(ctx);
  const netFlows = complete.map((m) => {
    const d = monthly.get(m)!;
    return d.income - (d.essential + d.discretionary + d.debt);
  });
  const avgNet =
    netFlows.length > 0
      ? netFlows.reduce((a, b) => a + b, 0) / netFlows.length
      : 0;

  return {
    health,
    patterns,
    forecast,
    recurring,
    metrics: {
      monthly_income_cents: Math.round(deriveMonthlyIncome(ctx)),
      avg_monthly_essential_cents: Math.round(
        avgMonthlyBucket(ctx, "essential", 3),
      ),
      avg_monthly_discretionary_cents: Math.round(
        avgMonthlyBucket(ctx, "discretionary", 3),
      ),
      avg_monthly_net_cents: Math.round(avgNet),
      liquid_balance_cents: getLiquidBalanceCents(ctx),
      months_of_data: complete.length,
    },
    computed_at: ctx.today.toISOString(),
  };
}
