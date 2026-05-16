import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTransaction } from "../_actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/select";
import { CATEGORIES } from "@/lib/categories";

export const metadata = { title: "Add transaction" };

export default async function NewTransactionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (!accounts || accounts.length === 0) redirect("/accounts/new");

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Add a transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTransaction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="occurred_on">Date</Label>
                <Input
                  id="occurred_on"
                  name="occurred_on"
                  type="date"
                  defaultValue={today}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_id">Account</Label>
                <Select id="account_id" name="account_id" required>
                  {accounts.map((a) => (
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
                    defaultChecked
                    className="h-4 w-4"
                  />
                  Money out
                </label>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted/40">
                  <input
                    type="radio"
                    name="direction"
                    value="in"
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
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                placeholder="Trader Joe's, paycheck, etc."
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                name="category"
                defaultValue="uncategorized"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <SubmitButton className="flex-1">Add transaction</SubmitButton>
              <Button
                type="button"
                variant="ghost"
                render={<Link href="/transactions">Cancel</Link>}
              />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
