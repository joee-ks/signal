import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadSampleData } from "./_actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCents } from "@/lib/format";

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
    .select("display_name, onboarded_at, monthly_income_cents")
    .eq("id", user.id)
    .maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/onboarding");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, current_balance_cents, is_archived")
    .eq("user_id", user.id);
  const active = (accounts ?? []).filter((a) => !a.is_archived);
  const netWorth = active.reduce(
    (s, a) => s + ((a.current_balance_cents as number) ?? 0),
    0,
  );

  const { count: txCount } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Allow loading sample data any time before the user has real transactions.
  // The action seeds a separate "Sample Checking" account so it can co-exist
  // with whatever account onboarding created.
  const showSampleDataButton = (txCount ?? 0) === 0;

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
          Sample data loaded. The intelligence engine (Phase 3) will turn this
          into real signals.
        </div>
      )}
      {info === "sample_skipped" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          You already have accounts — sample data was skipped to avoid mixing it
          with your real data.
        </div>
      )}

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
              {active.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {txCount ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Financial Health Score</CardTitle>
          <CardDescription>
            Coming in Phase 3 — your health score, top signals, and forecast
            will live here once the intelligence engine ships. For now: add real
            accounts + transactions, or load sample data to preview the shape of
            it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              render={<Link href="/transactions/new">Add a transaction</Link>}
            />
            <Button
              variant="outline"
              render={<Link href="/accounts">Manage accounts</Link>}
            />
            {showSampleDataButton && (
              <form action={loadSampleData}>
                <Button type="submit" variant="outline">
                  Load sample data
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
