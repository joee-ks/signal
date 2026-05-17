import { createHash } from "crypto";
import type { createClient } from "@/lib/supabase/server";
import { nowInAppTz } from "@/lib/timezone";
import { computeIntelligence } from "./index";
import {
  generateNarrative,
  NARRATIVE_MODEL,
  type Narrative,
} from "./narrate";
import type { IntelligenceResult } from "./types";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

const SOFT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * "Shape" of the intelligence result — the dimensions that meaningfully
 * change the narrative. We bucket continuous numbers (e.g. balance to the
 * nearest $100) so small fluctuations don't bust the cache.
 *
 * Currency is included so changing it (USD → EUR, etc.) invalidates the
 * cache and forces Claude to regenerate with the right symbol.
 *
 * If this hash matches the cached snapshot's shape_hash AND the snapshot is
 * fresher than the soft TTL, we reuse the cached narrative.
 */
export function shapeHash(intel: IntelligenceResult, currency: string): string {
  const shape = {
    c: currency,
    h: intel.health.total,
    s: Object.fromEntries(
      Object.entries(intel.health.sub_scores).map(([k, v]) => [k, v.score]),
    ),
    p: intel.patterns
      .map((p) => `${p.kind}:${p.severity}`)
      .sort(),
    f: {
      eom: bucket(intel.forecast.end_of_month_balance_cents, 10000),
      run:
        intel.forecast.runway_months != null
          ? Math.round(intel.forecast.runway_months)
          : null,
      def:
        intel.forecast.shock_drop?.deficit_cents != null
          ? bucket(intel.forecast.shock_drop.deficit_cents, 5000)
          : null,
    },
  };
  return createHash("sha256")
    .update(JSON.stringify(shape))
    .digest("hex")
    .slice(0, 16);
}

function bucket(n: number | null, size: number): number | null {
  if (n == null) return null;
  return Math.round(n / size) * size;
}

// ----------------------------------------------------------------------------

export type NarrativeFetchResult = {
  narrative: Narrative;
  generated_at: string;
  from_cache: boolean;
  model: string;
};

type CachedRow = {
  narrative: string | null; // JSON-serialized { narrative, shape_hash }
  narrative_model: string | null;
  generated_at: string;
};

/**
 * Look up the cached narrative for this user (`period = 'live'`).
 * Returns null if missing or unparseable.
 */
async function loadCached(
  supabase: SupaClient,
  userId: string,
): Promise<{
  narrative: Narrative;
  shape_hash: string;
  generated_at: string;
  model: string;
} | null> {
  const { data } = await supabase
    .from("signals_snapshots")
    .select("narrative, narrative_model, generated_at")
    .eq("user_id", userId)
    .eq("period", "live")
    .maybeSingle();
  if (!data) return null;
  const row = data as CachedRow;
  if (!row.narrative) return null;
  try {
    const parsed = JSON.parse(row.narrative) as {
      narrative: Narrative;
      shape_hash: string;
    };
    if (!parsed?.narrative || !parsed?.shape_hash) return null;
    return {
      narrative: parsed.narrative,
      shape_hash: parsed.shape_hash,
      generated_at: row.generated_at,
      model: row.narrative_model ?? "",
    };
  } catch {
    return null;
  }
}

/** Write the snapshot row (upsert on user_id+period). */
async function writeSnapshot(
  supabase: SupaClient,
  userId: string,
  intel: IntelligenceResult,
  narrative: Narrative,
  hash: string,
): Promise<string> {
  const generated_at = new Date().toISOString();
  await supabase.from("signals_snapshots").upsert(
    {
      user_id: userId,
      period: "live",
      health_score: intel.health.total,
      sub_scores: intel.health.sub_scores,
      patterns: intel.patterns,
      forecast: intel.forecast,
      metrics: intel.metrics,
      narrative: JSON.stringify({ narrative, shape_hash: hash }),
      narrative_model: NARRATIVE_MODEL,
      generated_at,
    },
    { onConflict: "user_id,period" },
  );
  return generated_at;
}

/**
 * Get a narrative for the current intelligence result — from cache if the
 * shape matches and the snapshot is fresh, otherwise generate via Claude
 * and persist. Pass `{ force: true }` to bypass the cache (e.g., from a
 * user-triggered "Recompute" button).
 */
export async function getOrGenerateNarrative(
  supabase: SupaClient,
  userId: string,
  intel: IntelligenceResult,
  options: { force?: boolean; currency?: string } = {},
): Promise<NarrativeFetchResult> {
  const currency = options.currency ?? "USD";
  const currentHash = shapeHash(intel, currency);

  if (!options.force) {
    const cached = await loadCached(supabase, userId);
    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (cached.shape_hash === currentHash && age < SOFT_TTL_MS) {
        return {
          narrative: cached.narrative,
          generated_at: cached.generated_at,
          from_cache: true,
          model: cached.model,
        };
      }
    }
  }

  const narrative = await generateNarrative(intel, { currency });
  const generated_at = await writeSnapshot(
    supabase,
    userId,
    intel,
    narrative,
    currentHash,
  );
  return {
    narrative,
    generated_at,
    from_cache: false,
    model: NARRATIVE_MODEL,
  };
}

// ----------------------------------------------------------------------------

/**
 * Convenience: fetch profile/accounts/transactions for `userId` and run the
 * full intelligence engine. Used by the dashboard page, the /signals page,
 * and the recompute action.
 */
export async function fetchAndComputeIntelligence(
  supabase: SupaClient,
  userId: string,
): Promise<IntelligenceResult> {
  const [profileQ, accountsQ, txnsQ] = await Promise.all([
    supabase
      .from("profiles")
      .select("monthly_income_cents, currency")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("accounts")
      .select("id, name, type, current_balance_cents, is_archived")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select(
        "id, account_id, occurred_on, amount_cents, description, category, bucket",
      )
      .eq("user_id", userId),
  ]);

  const profile = profileQ.data as
    | { monthly_income_cents: number | null; currency: string | null }
    | null;
  const accountRows = (accountsQ.data ?? []) as Array<{
    id: string;
    name: string;
    type: string;
    current_balance_cents: number | null;
    is_archived: boolean;
  }>;
  const txRows = (txnsQ.data ?? []) as Array<{
    id: string;
    account_id: string;
    occurred_on: string;
    amount_cents: number | null;
    description: string | null;
    category: string;
    bucket: string;
  }>;

  // Filter transactions to only those belonging to non-archived accounts.
  // Archived accounts are the user's way of saying "this data is no longer
  // relevant" (e.g. they archived sample data after deciding to use Signal
  // for real), so the engine ignores them entirely.
  const archivedAccountIds = new Set(
    accountRows.filter((a) => a.is_archived).map((a) => a.id),
  );
  const activeTxRows = txRows.filter(
    (t) => !archivedAccountIds.has(t.account_id),
  );

  return computeIntelligence({
    profile: {
      monthly_income_cents: profile?.monthly_income_cents ?? null,
      currency: profile?.currency ?? "USD",
    },
    accounts: accountRows.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type as
        | "checking"
        | "savings"
        | "credit"
        | "cash"
        | "other",
      current_balance_cents: a.current_balance_cents ?? 0,
      is_archived: a.is_archived,
    })),
    transactions: activeTxRows.map((t) => ({
      id: t.id,
      account_id: t.account_id,
      occurred_on: t.occurred_on,
      amount_cents: t.amount_cents ?? 0,
      description: t.description ?? "",
      category: t.category ?? "uncategorized",
      bucket: t.bucket ?? "discretionary",
    })),
    today: nowInAppTz(),
  });
}
