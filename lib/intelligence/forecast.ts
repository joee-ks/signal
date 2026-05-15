import {
  avgMonthlyBucket,
  deriveMonthlyIncome,
  getLiquidBalanceCents,
} from "./aggregates";
import type { Forecast, IntelligenceContext, ShockForecast } from "./types";

export function computeForecast(ctx: IntelligenceContext): Forecast {
  return {
    end_of_month_balance_cents: forecastEndOfMonth(ctx),
    runway_months: forecastRunway(ctx),
    shock_drop: forecastShock(ctx),
  };
}

/** Project balance to end-of-month using last-30-day burn rate. */
function forecastEndOfMonth(ctx: IntelligenceContext): number | null {
  const today = ctx.today;
  const t30 = new Date(today);
  t30.setDate(t30.getDate() - 30);

  let net30 = 0;
  let saw = 0;
  for (const t of ctx.transactions) {
    if (t.bucket === "transfer") continue;
    if (new Date(t.occurred_on + "T00:00:00") < t30) continue;
    net30 += t.amount_cents;
    saw++;
  }
  if (saw === 0) return null;

  const dailyBurn = net30 / 30;
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  const daysLeft = Math.max(0, lastDay - today.getDate());

  const liquid = getLiquidBalanceCents(ctx);
  return Math.round(liquid + dailyBurn * daysLeft);
}

/**
 * Months of runway = liquid balance ÷ (essentials + half of discretionary +
 * debt). We discount discretionary because in a real cash crunch, that gets
 * cut first.
 */
function forecastRunway(ctx: IntelligenceContext): number | null {
  const liquid = getLiquidBalanceCents(ctx);
  if (liquid <= 0) return 0;

  const essential = avgMonthlyBucket(ctx, "essential", 3);
  const discretionary = avgMonthlyBucket(ctx, "discretionary", 3);
  const debt = avgMonthlyBucket(ctx, "debt", 3);
  const monthlyBurn = essential + discretionary * 0.5 + debt;
  if (monthlyBurn <= 0) return null;

  return Math.round((liquid / monthlyBurn) * 10) / 10;
}

/** If income drops 20%, what's the gap on essentials? */
function forecastShock(ctx: IntelligenceContext): ShockForecast | null {
  const income = deriveMonthlyIncome(ctx);
  if (income <= 0) return null;

  const essential = avgMonthlyBucket(ctx, "essential", 3);
  const shockIncome = Math.round(income * 0.8);
  const deficit = Math.max(0, Math.round(essential - shockIncome));

  // Three biggest essential categories — most material to a crunch.
  const today = ctx.today;
  const t90 = new Date(today);
  t90.setDate(t90.getDate() - 90);
  const catTotals = new Map<string, number>();
  for (const t of ctx.transactions) {
    if (t.bucket !== "essential") continue;
    if (new Date(t.occurred_on + "T00:00:00") < t90) continue;
    catTotals.set(
      t.category,
      (catTotals.get(t.category) ?? 0) + Math.abs(t.amount_cents),
    );
  }
  const atRisk = Array.from(catTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);

  return {
    income_minus_20pct_cents: shockIncome,
    essential_outflow_cents: Math.round(essential),
    deficit_cents: deficit,
    at_risk_categories: atRisk,
  };
}
