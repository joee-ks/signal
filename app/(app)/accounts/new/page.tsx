import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAccount } from "../_actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/select";
import { MAX_ACCOUNTS_PER_USER } from "@/lib/profile";

export const metadata = { title: "Add account" };

export default async function NewAccountPage() {
  // Guard: if the user is already at the active-accounts cap, bounce back
  // to the list with the limit notice rather than showing a form whose
  // submission would just fail.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_archived", false);
  if ((count ?? 0) >= MAX_ACCOUNTS_PER_USER) {
    redirect("/accounts?info=account_limit");
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Add an account</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAccount} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Chase Checking"
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue="checking">
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit card</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance">Current balance</Label>
              <Input
                id="balance"
                name="balance"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue="0"
              />
              <p className="text-xs text-muted-foreground">
                For credit cards, enter the (negative) balance you owe, e.g.{" "}
                <code>-450.00</code>.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <SubmitButton className="flex-1">Add account</SubmitButton>
              <Button
                type="button"
                variant="ghost"
                render={<Link href="/accounts">Cancel</Link>}
              />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
