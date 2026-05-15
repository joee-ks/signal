import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteTransaction, updateTransaction } from "../_actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/select";
import { CATEGORIES } from "@/lib/categories";
import { dollarsFromCents } from "@/lib/format";

type TxnRow = {
  id: string;
  occurred_on: string;
  amount_cents: number;
  description: string | null;
  category: string;
  account_id: string;
};

export default async function EditTransactionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: txnData } = await supabase
    .from("transactions")
    .select("id, occurred_on, amount_cents, description, category, account_id")
    .eq("id", id)
    .maybeSingle();
  if (!txnData) notFound();
  const txn = txnData as TxnRow;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const direction = txn.amount_cents < 0 ? "out" : "in";
  const dollars = dollarsFromCents(Math.abs(txn.amount_cents));

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Edit transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateTransaction} className="space-y-4">
            <input type="hidden" name="id" value={txn.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="occurred_on">Date</Label>
                <Input
                  id="occurred_on"
                  name="occurred_on"
                  type="date"
                  defaultValue={txn.occurred_on}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_id">Account</Label>
                <Select
                  id="account_id"
                  name="account_id"
                  defaultValue={txn.account_id}
                  required
                >
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Direction</Label>
              <div className="flex gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted/40">
                  <input
                    type="radio"
                    name="direction"
                    value="out"
                    defaultChecked={direction === "out"}
                    className="h-4 w-4"
                  />
                  Money out
                </label>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted/40">
                  <input
                    type="radio"
                    name="direction"
                    value="in"
                    defaultChecked={direction === "in"}
                    className="h-4 w-4"
                  />
                  Money in
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="text"
                inputMode="decimal"
                defaultValue={dollars}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                defaultValue={txn.description ?? ""}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                name="category"
                defaultValue={txn.category}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <SubmitButton className="flex-1">Save changes</SubmitButton>
              <Button
                type="button"
                variant="ghost"
                render={<Link href="/transactions">Cancel</Link>}
              />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={deleteTransaction}>
            <input type="hidden" name="id" value={txn.id} />
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Delete transaction
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
