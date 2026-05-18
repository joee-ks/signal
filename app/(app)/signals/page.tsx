import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAndComputeIntelligence,
  getOrGenerateNarrative,
} from "@/lib/intelligence/snapshot";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatternCard } from "@/components/pattern-card";
import {
  NarrativeCard,
  NarrativeErrorCard,
  NarrativeSkeleton,
} from "@/components/narrative-card";
import { formatCents } from "@/lib/format";
import { labelFor } from "@/lib/categories";
import { getUserCurrency } from "@/lib/profile";
import { detectSamplePersona, type PersonaId } from "@/lib/sample-data";
import type { IntelligenceResult } from "@/lib/intelligence/types";

const CADENCE_LABEL: Record<string, string> = {
  weekly: "every week",
  biweekly: "every 2 weeks",
  monthly: "monthly",
  yearly: "yearly",
};

export const metadata = { title: "Signals" };

export default async function SignalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [intel, currency, accountsQ] = await Promise.all([
    fetchAndComputeIntelligence(supabase, user.id),
    getUserCurrency(supabase, user.id),
    supabase
      .from("accounts")
      .select("name, is_archived")
      .eq("user_id", user.id),
  ]);
  const samplePersonaId = detectSamplePersona(accountsQ.data ?? []);

  const recurringOut = intel.recurring.filter((r) => r.direction === "out");
  const recurringIn = intel.recurring.filter((r) => r.direction === "in");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
        <p className="text-sm text-muted-foreground">
          Patterns the engine has detected in your activity, plus the recurring
          charges it&apos;s tracking.
        </p>
      </div>

      <Suspense fallback={<NarrativeSkeleton />}>
        <NarrativeBlock
          userId={user.id}
          intel={intel}
          currency={currency}
          samplePersonaId={samplePersonaId}
        />
      </Suspense>

      {/* All patterns */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">
          Patterns
          <span className="ml-2 text-xs text-muted-foreground">
            ({intel.patterns.length})
          </span>
        </h2>
        {intel.patterns.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Nothing to flag right now. The more activity you record, the
              more the engine can detect.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {intel.patterns.map((p, i) => (
              <PatternCard key={`${p.kind}-${i}`} pattern={p} />
            ))}
          </div>
        )}
      </div>

      {/* Recurring outflows */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">
          Recurring charges
          <span className="ml-2 text-xs text-muted-foreground">
            ({recurringOut.length})
          </span>
        </h2>
        {recurringOut.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No recurring outflows detected yet — need at least two repeats
              with consistent timing.
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y">
              {recurringOut.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.sample_description}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{CADENCE_LABEL[r.cadence] ?? r.cadence}</span>
                      <span>·</span>
                      <span>{r.count} charges</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {labelFor(r.category)}
                      </Badge>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCents(-r.monthly_equivalent_cents, { currency })}/mo
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Recurring inflows */}
      {recurringIn.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">
            Recurring income
            <span className="ml-2 text-xs text-muted-foreground">
              ({recurringIn.length})
            </span>
          </h2>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y">
              {recurringIn.map((r) => (
                <li
                  key={r.key}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.sample_description}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{CADENCE_LABEL[r.cadence] ?? r.cadence}</span>
                      <span>·</span>
                      <span>{r.count} deposits</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatCents(r.monthly_equivalent_cents, { currency })}/mo
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">The engine, briefly</CardTitle>
          <CardDescription className="space-y-2 text-sm">
            <span className="block">
              The numbers and patterns above are computed by deterministic
              TypeScript — no AI, no third-party data. The narrative at the top
              is the only place AI is involved; it&apos;s a plain-English
              read of the same structured signals.
            </span>
            <span className="block">
              The Financial Health Score is a weighted average of five
              sub-scores: buffer/runway, cash-flow stability, commitment load,
              discretionary discipline, and shock resilience.
            </span>
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

async function NarrativeBlock({
  userId,
  intel,
  currency,
  samplePersonaId,
}: {
  userId: string;
  intel: IntelligenceResult;
  currency: string;
  samplePersonaId: PersonaId | null;
}) {
  const supabase = await createClient();
  try {
    const result = await getOrGenerateNarrative(supabase, userId, intel, {
      currency,
      samplePersonaId,
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
