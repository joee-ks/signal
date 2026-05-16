import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAndComputeIntelligence,
  getOrGenerateNarrative,
} from "@/lib/intelligence/snapshot";
import { loadSampleData } from "./_actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HealthGauge } from "@/components/health-gauge";
import { PatternCard } from "@/components/pattern-card";
import {
  NarrativeCard,
  NarrativeErrorCard,
  NarrativeSkeleton,
} from "@/components/narrative-card";
import { formatCents } from "@/lib/format";
import { labelFor } from "@/lib/categories";
import type {
  IntelligenceResult,
  SubScoreKey,
} from "@/lib/intelligence/types";

const SUB_SCORE_LABEL: Record<SubScoreKey, string> = {
  buffer: "Buffer / runway",
  stability: "Cash-flow stability",
  commitment: "Commitment load",
  discretionary: "Discretionary discipline",
  shock: "Shock resilience",
};

export default async function DashboardPage(props: {
  searchParams: Promise<{ info?: string }>;
}) {
  const { info } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  const [intel, accountsQ, txCountQ] = await Promise.all([
    fetchAndComputeIntelligence(supabase, user.id),
    supabase
      .from("accounts")
      .select("id, current_balance_cents, is_archived")
      .eq("user_id", user.id),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const accountRows = (accountsQ.data ?? []) as Array<{
    is_archived: boolean;
    current_balance_cents: number | null;
  }>;
  const activeAccounts = accountRows.filter((a) => !a.is_archived);
  const netWorth = activeAccounts.reduce(
    (s, a) => s + (a.current_balance_cents ?? 0),
    0,
  );
  const txCount = txCountQ.count ?? 0;
  const hasTransactions = txCount > 0;

  const topPatterns = intel.patterns.slice(0, 3);
  const remainingPatterns = intel.patterns.length - topPatterns.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.display_name
            ? `Hi, ${profile.display_name}.`
            : `Signed in as ${user.email}`}
        </p>
      </div>

      {info === "sample_loaded" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Sample data loaded — the dashboard is computed from it.
        </div>
      )}
      {info === "sample_skipped" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          You already have transactions — sample data was skipped.
        </div>
      )}
      {info === "recomputed" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Signals recomputed.
        </div>
      )}

      {!hasTransactions ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing to signal on yet</CardTitle>
            <CardDescription>
              Add a few transactions or load sample data to see your Financial
              Health Score, signals, and forecast.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                render={<Link href="/transactions/new">Add a transaction</Link>}
              />
              <form action={loadSampleData}>
                <Button type="submit" variant="outline">
                  Load sample data
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Narrative — streams in via Suspense */}
          <Suspense fallback={<NarrativeSkeleton />}>
            <NarrativeBlock userId={user.id} intel={intel} />
          </Suspense>

          {/* Hero: Health score + sub-scores */}
          <Card>
            <CardContent className="py-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
                <div className="flex flex-col items-center gap-2">
                  <HealthGauge score={intel.health.total} size="lg" />
                  <p className="text-sm font-medium">
                    Financial Health Score
                  </p>
                </div>
                <div className="flex-1 space-y-3">
                  {(
                    Object.keys(intel.health.sub_scores) as SubScoreKey[]
                  ).map((key) => {
                    const sub = intel.health.sub_scores[key];
                    return (
                      <SubScoreBar
                        key={key}
                        label={SUB_SCORE_LABEL[key]}
                        score={sub.score}
                        reason={sub.reason}
                      />
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top signals */}
          {topPatterns.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Top signals</h2>
                {remainingPatterns > 0 && (
                  <Link
                    href="/signals"
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    See all ({intel.patterns.length}) →
                  </Link>
                )}
              </div>
              <div className="space-y-2">
                {topPatterns.map((p, i) => (
                  <PatternCard key={`${p.kind}-${i}`} pattern={p} />
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No notable signals right now. Add more activity to surface
                trends.
              </CardContent>
            </Card>
          )}

          {/* Forecast */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecast</CardTitle>
              <CardDescription>
                Projected from the last 30 days of activity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ForecastRow
                label="Projected end-of-month balance"
                value={
                  intel.forecast.end_of_month_balance_cents != null
                    ? formatCents(intel.forecast.end_of_month_balance_cents)
                    : "—"
                }
              />
              <ForecastRow
                label="Runway at current burn"
                value={
                  intel.forecast.runway_months != null
                    ? `${intel.forecast.runway_months.toFixed(1)} months`
                    : "—"
                }
                help="Liquid balance ÷ (essentials + half-discretionary + debt). What you'd last on if income stopped."
              />
              {intel.forecast.shock_drop && (
                <ForecastRow
                  label="If income drops 20%"
                  value={
                    intel.forecast.shock_drop.deficit_cents > 0
                      ? `Short ${formatCents(intel.forecast.shock_drop.deficit_cents)}/mo`
                      : "Still covered"
                  }
                  help={
                    intel.forecast.shock_drop.deficit_cents > 0 &&
                    intel.forecast.shock_drop.at_risk_categories.length > 0
                      ? `Largest essentials: ${intel.forecast.shock_drop.at_risk_categories.map(labelFor).join(", ")}.`
                      : "Your essentials fit inside shock-adjusted income."
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Summary trio */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Net across accounts</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatCents(netWorth)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Active accounts</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {activeAccounts.length}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Transactions</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {txCount}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Async server component — runs inside the Suspense boundary so the rest of
 * the dashboard streams immediately while we wait on Claude (which can take
 * a few seconds on a cache miss).
 */
async function NarrativeBlock({
  userId,
  intel,
}: {
  userId: string;
  intel: IntelligenceResult;
}) {
  const supabase = await createClient();
  try {
    const result = await getOrGenerateNarrative(supabase, userId, intel);
    return (
      <NarrativeCard
        narrative={result.narrative}
        generatedAt={result.generated_at}
        fromCache={result.from_cache}
      />
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return <NarrativeErrorCard message={message} />;
  }
}

function SubScoreBar({
  label,
  score,
  reason,
}: {
  label: string;
  score: number | null;
  reason?: string;
}) {
  const colorClass =
    score == null
      ? "bg-muted"
      : score >= 75
        ? "bg-emerald-500"
        : score >= 50
          ? "bg-amber-500"
          : score >= 25
            ? "bg-orange-500"
            : "bg-red-500";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {score == null ? "—" : score}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${colorClass} transition-[width]`}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>
      {score == null && reason && (
        <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
      )}
    </div>
  );
}

function ForecastRow({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      <p className="shrink-0 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
