import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  archiveAccount,
  unarchiveAccount,
  updateAccount,
} from "../_actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/select";
import { dollarsFromCents } from "@/lib/format";

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Edit account</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAccount} className="space-y-4">
            <input type="hidden" name="id" value={account.id} />
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={account.name}
                required
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue={account.type}>
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
                defaultValue={dollarsFromCents(
                  account.current_balance_cents ?? 0,
                )}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                Save changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                render={<Link href="/accounts">Cancel</Link>}
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
          {account.is_archived ? (
            <form action={unarchiveAccount}>
              <input type="hidden" name="id" value={account.id} />
              <p className="mb-3 text-sm text-muted-foreground">
                This account is archived — hidden from totals, transactions
                preserved.
              </p>
              <Button type="submit" variant="outline">
                Unarchive account
              </Button>
            </form>
          ) : (
            <form action={archiveAccount}>
              <input type="hidden" name="id" value={account.id} />
              <p className="mb-3 text-sm text-muted-foreground">
                Archiving hides the account from totals but preserves all its
                transaction history. You can unarchive any time.
              </p>
              <Button type="submit" variant="destructive">
                Archive account
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
