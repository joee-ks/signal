import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate } from "@/lib/format";
import { labelFor } from "@/lib/categories";
import { getUserCurrency } from "@/lib/profile";

type TxnRow = {
  id: string;
  occurred_on: string;
  amount_cents: number;
  description: string | null;
  category: string;
  account_id: string;
  is_recurring: boolean;
};

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [accountsQ, txnsQ, currency] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_archived", false),
    supabase
      .from("transactions")
      .select(
        "id, occurred_on, amount_cents, description, category, account_id, is_recurring",
      )
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    getUserCurrency(supabase, user.id),
  ]);
  const hasAccounts = (accountsQ.data ?? []).length > 0;
  const accountNameMap = new Map(
    (accountsQ.data ?? []).map((a) => [a.id as string, a.name as string]),
  );
  const txns: TxnRow[] = (txnsQ.data ?? []) as TxnRow[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">
            Most recent first · showing up to 200
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            render={<Link href="/accounts">Accounts</Link>}
          />
          {hasAccounts && (
            <Button render={<Link href="/transactions/new">Add</Link>} />
          )}
        </div>
      </div>

      {!hasAccounts ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You need at least one account first.{" "}
            <Link
              href="/accounts/new"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Add one
            </Link>
            .
          </CardContent>
        </Card>
      ) : txns.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No transactions yet.{" "}
            <Link
              href="/transactions/new"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Add one
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y">
            {txns.map((t) => {
              const isIn = t.amount_cents > 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/transactions/${t.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {t.description || "(no description)"}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatDate(t.occurred_on)}</span>
                        <span>·</span>
                        <span>
                          {accountNameMap.get(t.account_id) ?? "Unknown"}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {labelFor(t.category)}
                        </Badge>
                        {t.is_recurring && (
                          <Badge variant="outline" className="text-[10px]">
                            recurring
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        isIn
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-foreground"
                      }`}
                    >
                      {formatCents(t.amount_cents, { sign: "always", currency })}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
