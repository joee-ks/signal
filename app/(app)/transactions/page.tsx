import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/select";
import { SubmitButton } from "@/components/submit-button";
import { formatCents, formatDate } from "@/lib/format";
import { CATEGORIES, labelFor } from "@/lib/categories";
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

const RESULT_LIMIT = 200;

/**
 * Escape characters that have special meaning inside a Supabase `or(...)`
 * comma-separated filter expression. Without this, a comma in the user's
 * search input would split the expression into multiple filters.
 */
function escapeForOr(value: string): string {
  return value.replace(/[,()]/g, " ");
}

export default async function TransactionsPage(props: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q: rawQ, category: rawCategory } = await props.searchParams;
  const q = (rawQ ?? "").trim();
  const category = (rawCategory ?? "").trim();
  const hasFilters = q.length > 0 || category.length > 0;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Build the transactions query with filters applied at the DB level so
  // we don't pull 200 rows just to throw most away client-side. Search
  // hits both description and merchant via Postgres ILIKE.
  let txnsQuery = supabase
    .from("transactions")
    .select(
      "id, occurred_on, amount_cents, description, category, account_id, is_recurring",
    )
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(RESULT_LIMIT);
  if (q) {
    const safe = escapeForOr(q);
    txnsQuery = txnsQuery.or(
      `description.ilike.%${safe}%,merchant.ilike.%${safe}%`,
    );
  }
  if (category) {
    txnsQuery = txnsQuery.eq("category", category);
  }

  const [accountsQ, txnsQ, currency] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_archived", false),
    txnsQuery,
    getUserCurrency(supabase, user.id),
  ]);
  const hasAccounts = (accountsQ.data ?? []).length > 0;
  const accountNameMap = new Map(
    (accountsQ.data ?? []).map((a) => [a.id as string, a.name as string]),
  );
  // Drop transactions whose account isn't in the active set (i.e. archived).
  const txns: TxnRow[] = ((txnsQ.data ?? []) as TxnRow[]).filter((t) =>
    accountNameMap.has(t.account_id),
  );

  const countCopy = hasFilters
    ? `${txns.length} ${txns.length === 1 ? "match" : "matches"}`
    : `Most recent first · showing up to ${RESULT_LIMIT}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="text-sm text-muted-foreground">{countCopy}</p>
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

      {hasAccounts && (
        <Card>
          <CardContent className="pt-4">
            <form
              method="get"
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="q" className="text-xs">
                  Search description
                </Label>
                <Input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="amazon, chipotle, paycheck…"
                />
              </div>
              <div className="space-y-1.5 sm:w-48">
                <Label htmlFor="category" className="text-xs">
                  Category
                </Label>
                <Select id="category" name="category" defaultValue={category}>
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <SubmitButton variant="outline">Apply</SubmitButton>
                {hasFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    render={<Link href="/transactions">Clear</Link>}
                  />
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

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
            {hasFilters ? (
              <>
                No transactions match those filters.{" "}
                <Link
                  href="/transactions"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Clear
                </Link>
                .
              </>
            ) : (
              <>
                No transactions yet.{" "}
                <Link
                  href="/transactions/new"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Add one
                </Link>
                .
              </>
            )}
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
