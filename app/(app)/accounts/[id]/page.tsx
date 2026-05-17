import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  archiveAccount,
  deleteAccount,
  unarchiveAccount,
  updateAccount,
} from "../_actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/select";
import { dollarsFromCents } from "@/lib/format";

export const metadata = { title: "Edit account" };

export default async function EditAccountPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: account }, { count: txCount }] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("account_id", id)
      .eq("user_id", user.id),
  ]);
  if (!account) notFound();

  const hasTransactions = (txCount ?? 0) > 0;

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
              <SubmitButton className="flex-1">Save changes</SubmitButton>
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
            <div className="space-y-6">
              <form action={unarchiveAccount}>
                <input type="hidden" name="id" value={account.id} />
                <p className="mb-3 text-sm text-muted-foreground">
                  This account is archived — hidden from totals and excluded
                  from your dashboard, signals, and forecast. Transactions are
                  preserved here but no longer affect your data.
                </p>
                <SubmitButton variant="outline">
                  Unarchive account
                </SubmitButton>
              </form>

              {hasTransactions && (
                <form action={deleteAccount} className="space-y-4 border-t pt-6">
                  <input type="hidden" name="id" value={account.id} />
                  <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p>
                      Permanently delete this account and its{" "}
                      {txCount} transaction{txCount === 1 ? "" : "s"}.
                    </p>
                    <p className="text-foreground">There is no undo.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">
                      Type{" "}
                      <strong className="font-mono">DELETE</strong> to confirm
                    </Label>
                    <Input
                      id="confirm"
                      name="confirm"
                      required
                      placeholder="DELETE"
                      pattern="DELETE"
                      autoComplete="off"
                    />
                  </div>
                  <SubmitButton variant="destructive" pendingLabel="Deleting…">
                    Permanently delete account
                  </SubmitButton>
                </form>
              )}

              {!hasTransactions && (
                <form action={deleteAccount} className="border-t pt-6">
                  <input type="hidden" name="id" value={account.id} />
                  <p className="mb-3 text-sm text-muted-foreground">
                    This account has no transactions, so it can be deleted
                    outright.
                  </p>
                  <SubmitButton variant="destructive" pendingLabel="Deleting…">
                    Delete account
                  </SubmitButton>
                </form>
              )}
            </div>
          ) : hasTransactions ? (
            <form action={archiveAccount}>
              <input type="hidden" name="id" value={account.id} />
              <p className="mb-3 text-sm text-muted-foreground">
                Archiving hides the account from totals but preserves its
                transaction history. You can unarchive any time.
              </p>
              <SubmitButton variant="destructive">Archive account</SubmitButton>
            </form>
          ) : (
            <form action={deleteAccount}>
              <input type="hidden" name="id" value={account.id} />
              <p className="mb-3 text-sm text-muted-foreground">
                This account has no transactions, so it can be deleted outright.
                (If you later add transactions, you&apos;ll only be able to
                archive it.)
              </p>
              <SubmitButton variant="destructive" pendingLabel="Deleting…">
                Delete account
              </SubmitButton>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
