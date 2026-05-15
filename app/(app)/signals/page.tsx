import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatternCard } from "@/components/pattern-card";
import { formatCents } from "@/lib/format";
import { labelFor } from "@/lib/categories";
import { computeIntelligence } from "@/lib/intelligence";
import type { Account, Transaction } from "@/lib/intelligence/types";

const CADENCE_LABEL: Record<string, string> = {
  weekly: "every week",
  biweekly: "every 2 weeks",
  monthly: "monthly",
  yearly: "yearly",
};

export default async function SignalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_income_cents, currency")
    .eq("id", user.id)
    .maybeSingle();

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, type, current_balance_cents, is_archived")
    .eq("user_id", user.id);
  const accounts: Account[] = (accountRows ?? []) as Account[];

  const { data: txRows } = await supabase
    .from("transactions")
    .select(
      "id, account_id, occurred_on, amount_cents, description, category, bucket",
    )
    .eq("user_id", user.id);
  const transactions: Transaction[] = (txRows ?? []).map((t) => ({
    id: t.id as string,
    account_id: t.account_id as string,
    occurred_on: t.occurred_on as string,
    amount_cents: (t.amount_cents as number) ?? 0,
    description: (t.description as string) ?? "",
    category: (t.category as string) ?? "uncategorized",
    bucket: (t.bucket as string) ?? "discretionary",
  }));

  const intel = computeIntelligence({
    profile: {
      monthly_income_cents: profile?.monthly_income_cents ?? null,
      currency: profile?.currency ?? "USD",
    },
    accounts,
    transactions,
    today: new Date(),
  });

  const recurringOut = intel.recurring.filter((r) => r.direction === "out");
  const recurringIn = intel.recurring.filter((r) => r.direction === "in");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
        <p className="text-sm text-muted-foreground">
          Patterns the engine has detected in your activity, plus the recurring
          charges it's tracking.
        </p>
      </div>

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
                      {formatCents(-r.typical_amount_cents)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ~{formatCents(-r.monthly_equivalent_cents)}/mo
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
                      +{formatCents(r.typical_amount_cents)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ~{formatCents(r.monthly_equivalent_cents)}/mo
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
              Everything on this page is computed by deterministic TypeScript
              over your transactions — no AI, no third-party data. The
              Financial Health Score is a weighted average of five sub-scores:
              buffer/runway, cash-flow stability, commitment load,
              discretionary discipline, and shock resilience.
            </span>
            <span className="block">
              In a future phase, Claude will turn this structured output into
              plain-language narrative — for now, the numbers and patterns
              speak for themselves.
            </span>
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
