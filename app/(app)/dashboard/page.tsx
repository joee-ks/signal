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
import { SubmitButton } from "@/components/submit-button";
import { HealthGauge } from "@/components/health-gauge";
import { PatternCard } from "@/components/pattern-card";
import {
  NarrativeCard,
  NarrativeErrorCard,
  NarrativeSkeleton,
} from "@/components/narrative-card";
import { formatCents } from "@/lib/format";
import { labelFor } from "@/lib/categories";
import { PERSONAS } from "@/lib/sample-data";
import type {
  IntelligenceResult,
  SubScoreKey,
} from "@/lib/intelligence/types";

/** Format runway months with the right singular/plural unit. */
function runwayString(months: number | null): string {
  if (months == null) return "—";
  const formatted = months.toFixed(1);
  return `${formatted} ${formatted === "1.0" ? "month" : "months"}`;
}

const SUB_SCORE_LABEL: Record<SubScoreKey, string> = {
  buffer: "Buffer / runway",
  stability: "Cash-flow stability",
  commitment: "Commitment load",
  discretionary: "Discretionary discipline",
  shock: "Shock resilience",
};

type AccountRow = {
  id: string;
  name: string;
  current_balance_cents: number | null;
  is_archived: boolean;
};

export const metadata = { title: "Dashboard" };

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
    .select("display_name, onboarded_at, currency")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/onboarding");
  const currency = (profile?.currency as string | null) ?? "USD";

  // Fetch accounts first so we know which IDs are active. The transaction
  // count + intel both need that filter.
  const { data: accountsData } = await supabase
    .from("accounts")
    .select("id, name, current_balance_cents, is_archived")
    .eq("user_id", user.id);
  const accounts = (accountsData ?? []) as AccountRow[];
  const activeAccounts = accounts.filter((a) => !a.is_archived);
  const activeAccountIds = activeAccounts.map((a) => a.id);
  const netWorth = activeAccounts.reduce(
    (s, a) => s + (a.current_balance_cents ?? 0),
    0,
  );

  const [intel, txCountQ] = await Promise.all([
    fetchAndComputeIntelligence(supabase, user.id),
    activeAccountIds.length === 0
      ? Promise.resolve({ count: 0 } as { count: number | null })
      : supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("account_id", activeAccountIds),
  ]);

  const txCount = txCountQ.count ?? 0;
  const hasTransactions = txCount > 0;

  // Sample-data detection: the persona switcher shows when the user has txns
  // (so the dashboard isn't in its blank empty state) but no active account
  // of their own. As soon as they add their own (non-Sample-prefixed)
  // account, the switcher hides.
  const hasOwnAccount = accounts.some(
    (a) => !a.is_archived && !a.name.startsWith("Sample"),
  );
  const showPersonaSwitcher = hasTransactions && !hasOwnAccount;

  const topPatterns = intel.patterns.slice(0, 3);
  const remainingPatterns = intel.patterns.length - topPatterns.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {profile?.display_name
            ? `Hi, ${profile.display_name}.`
            : `Signed in as ${user.email}.`}
        </p>
      </div>

      {info === "sample_loaded" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Sample data loaded — the dashboard is computed from it.
        </div>
      )}
      {info === "sample_skipped" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          You have real transactions — sample data was skipped to avoid mixing
          it with your own.
        </div>
      )}
      {info === "recomputed" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Signals recomputed.
        </div>
      )}

      {!hasTransactions ? (
        hasOwnAccount ? (
          <Card>
            <CardHeader>
              <CardTitle>Add your first transaction</CardTitle>
              <CardDescription>
                Your account is set up — log a transaction or two to start
                seeing your Financial Health Score and signals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                render={
                  <Link href="/transactions/new">Add a transaction</Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <PersonaPicker variant="empty" />
        )
      ) : (
        <>
          <Suspense fallback={<NarrativeSkeleton />}>
            <NarrativeBlock
              userId={user.id}
              intel={intel}
              currency={currency}
            />
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
                Nothing to flag right now. The more activity you record, the
                more the engine can detect.
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
                    ? formatCents(intel.forecast.end_of_month_balance_cents, { currency })
                    : "—"
                }
              />
              <ForecastRow
                label="Runway"
                value={runwayString(intel.forecast.runway_months)}
                help="Liquid balance ÷ (essentials + half-discretionary + debt). What you'd last on if income stopped."
              />
              {intel.forecast.shock_drop && (
                <ForecastRow
                  label="If income drops 20%"
                  value={
                    intel.forecast.shock_drop.deficit_cents > 0
                      ? `Short ${formatCents(intel.forecast.shock_drop.deficit_cents, { currency })}/mo`
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
                  {formatCents(netWorth, { currency })}
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

          {showPersonaSwitcher && (
            <>
              <PersonaPicker variant="switcher" />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Set up your real data
                  </CardTitle>
                  <CardDescription>
                    Add your first real account to switch out of sample
                    mode — the sample data will be wiped automatically. You
                    can{" "}
                    <Link
                      href="/settings"
                      className="underline underline-offset-4 hover:text-foreground"
                    >
                      update your monthly income
                    </Link>{" "}
                    in settings any time.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    render={
                      <Link href="/accounts/new">Add your first account</Link>
                    }
                  />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Persona picker — used in two layouts:
 *   - "empty": prominent card shown when the user has no transactions.
 *   - "switcher": compact card shown when they have only sample data,
 *     letting them swap personas one-click.
 */
function PersonaPicker({ variant }: { variant: "empty" | "switcher" }) {
  if (variant === "empty") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Try Signal with sample data</CardTitle>
          <CardDescription>
            Pick a persona to seed ~3 months of realistic transactions and an
            income to match. Or{" "}
            <Link
              href="/transactions/new"
              className="underline underline-offset-4 hover:text-foreground"
            >
              add your own transaction
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {PERSONAS.map((p) => (
              <form key={p.id} action={loadSampleData}>
                <input type="hidden" name="persona" value={p.id} />
                <SubmitButton
                  variant="outline"
                  className="w-full"
                  pendingLabel="Loading…"
                >
                  {p.label}
                </SubmitButton>
              </form>
            ))}
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {PERSONAS.map((p) => (
              <li key={p.id}>
                <strong className="text-foreground">{p.label}:</strong>{" "}
                {p.description}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  // Switcher variant — bottom of the dashboard for sample-data-only users.
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Swap sample persona</CardTitle>
        <CardDescription>
          You&apos;re viewing sample data. Switch to a different persona to see
          how the engine and narrative respond — this wipes the previous sample
          data. Adding your own account will hide this section.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {PERSONAS.map((p) => (
            <form key={p.id} action={loadSampleData}>
              <input type="hidden" name="persona" value={p.id} />
              <SubmitButton
                variant="outline"
                size="sm"
                pendingLabel="Loading…"
              >
                {p.label}
              </SubmitButton>
            </form>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

async function NarrativeBlock({
  userId,
  intel,
  currency,
}: {
  userId: string;
  intel: IntelligenceResult;
  currency: string;
}) {
  const supabase = await createClient();
  try {
    const result = await getOrGenerateNarrative(supabase, userId, intel, {
      currency,
    });
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
