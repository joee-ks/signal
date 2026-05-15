import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit: "Credit",
  cash: "Cash",
  other: "Other",
};

type AccountRow = {
  id: string;
  name: string;
  type: string;
  current_balance_cents: number;
  is_archived: boolean;
};

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("accounts")
    .select("id, name, type, current_balance_cents, is_archived")
    .eq("user_id", user.id)
    .order("is_archived", { ascending: true })
    .order("created_at", { ascending: true });
  const accounts: AccountRow[] = (data ?? []) as AccountRow[];

  const active = accounts.filter((a) => !a.is_archived);
  const archived = accounts.filter((a) => a.is_archived);
  const netWorth = active.reduce(
    (s, a) => s + (a.current_balance_cents ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Net across active accounts:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatCents(netWorth)}
            </span>
          </p>
        </div>
        <Button render={<Link href="/accounts/new">Add account</Link>} />
      </div>

      {active.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No accounts yet.{" "}
            <Link
              href="/accounts/new"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Add your first one
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((a) => (
            <Link key={a.id} href={`/accounts/${a.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{a.name}</CardTitle>
                    <Badge variant="secondary">
                      {TYPE_LABEL[a.type] ?? a.type}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    {formatCents(a.current_balance_cents)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Archived
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {archived.map((a) => (
              <Link key={a.id} href={`/accounts/${a.id}`} className="block">
                <Card className="opacity-60 transition-opacity hover:opacity-90">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{a.name}</CardTitle>
                      <Badge variant="outline">
                        {TYPE_LABEL[a.type] ?? a.type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold tracking-tight tabular-nums">
                      {formatCents(a.current_balance_cents)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
