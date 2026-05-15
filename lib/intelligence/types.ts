/**
 * Signal intelligence engine — shared types.
 *
 * Everything in `lib/intelligence/` is pure, deterministic TypeScript. No DB,
 * no React, no env. Input is a normalized `IntelligenceContext`; output is an
 * `IntelligenceResult` that the dashboard renders and the snapshot table stores.
 */

export type Bucket =
  | "income"
  | "essential"
  | "discretionary"
  | "transfer"
  | "debt";

export type Profile = {
  monthly_income_cents: number | null;
  currency: string;
};

export type Account = {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit" | "cash" | "other";
  current_balance_cents: number;
  is_archived: boolean;
};

export type Transaction = {
  id: string;
  account_id: string;
  occurred_on: string; // YYYY-MM-DD
  amount_cents: number; // signed: negative = outflow
  description: string;
  category: string;
  bucket: string; // 'income' | 'essential' | 'discretionary' | 'transfer' | 'debt'
};

export type IntelligenceContext = {
  profile: Profile;
  accounts: Account[];
  transactions: Transaction[];
  today: Date;
};

// ----- Health score -----------------------------------------------------------

export type SubScore = {
  score: number | null; // null = not enough data
  reason?: string;
};

export type SubScoreKey =
  | "buffer"
  | "stability"
  | "commitment"
  | "discretionary"
  | "shock";

export type HealthScoreResult = {
  total: number | null;
  sub_scores: Record<SubScoreKey, SubScore>;
  weights: Record<SubScoreKey, number>;
};

// ----- Patterns ---------------------------------------------------------------

export type PatternSeverity = "info" | "watch" | "high";

export type PatternKind =
  | "subscription_creep"
  | "lifestyle_inflation"
  | "thousand_cuts"
  | "income_irregularity"
  | "anomaly"
  | "discretionary_share";

export type Pattern = {
  kind: PatternKind;
  severity: PatternSeverity;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
};

// ----- Forecast ---------------------------------------------------------------

export type ShockForecast = {
  income_minus_20pct_cents: number;
  essential_outflow_cents: number;
  deficit_cents: number; // 0 if shock-income still covers essentials
  at_risk_categories: string[];
};

export type Forecast = {
  end_of_month_balance_cents: number | null;
  runway_months: number | null;
  shock_drop: ShockForecast | null;
};

// ----- Recurring detection ----------------------------------------------------

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";

export type RecurringCharge = {
  key: string; // normalized merchant key
  sample_description: string;
  typical_amount_cents: number; // positive magnitude
  monthly_equivalent_cents: number; // positive magnitude
  cadence: Cadence;
  count: number;
  first_seen: string;
  last_seen: string;
  category: string;
  bucket: string;
  direction: "in" | "out"; // money in (income) vs money out (expense)
};

// ----- Top-level result -------------------------------------------------------

export type IntelligenceResult = {
  health: HealthScoreResult;
  patterns: Pattern[];
  forecast: Forecast;
  recurring: RecurringCharge[];
  metrics: {
    monthly_income_cents: number;
    avg_monthly_essential_cents: number;
    avg_monthly_discretionary_cents: number;
    avg_monthly_net_cents: number;
    liquid_balance_cents: number;
    months_of_data: number;
  };
  computed_at: string;
};
