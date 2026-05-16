import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  deleteAccount,
  requestEmailChange,
  updateProfile,
} from "./_actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/select";
import { SubmitButton } from "@/components/submit-button";
import { dollarsFromCents } from "@/lib/format";
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from "@/lib/profile";

export const metadata = { title: "Settings" };

export default async function SettingsPage(props: {
  searchParams: Promise<{
    saved?: string;
    info?: string;
    message?: string;
  }>;
}) {
  const { saved, info, message } = await props.searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, monthly_income_cents, currency")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile and account.
        </p>
      </div>

      {saved === "1" && <Banner tone="ok">Saved.</Banner>}
      {info === "email_change_sent" && (
        <Banner tone="ok">
          Confirmation link sent. Open it from your new inbox to finish the
          change.
        </Banner>
      )}
      {info === "email_unchanged" && (
        <Banner tone="warn">That&apos;s already your email.</Banner>
      )}
      {info === "email_change_failed" && (
        <Banner tone="warn">
          Couldn&apos;t send the confirmation
          {message ? `: ${decodeURIComponent(message)}` : "."}
        </Banner>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            These values feed the intelligence engine — update whenever your
            situation changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                name="display_name"
                defaultValue={profile?.display_name ?? ""}
                maxLength={80}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_income">
                Monthly income (after taxes)
              </Label>
              <Input
                id="monthly_income"
                name="monthly_income"
                type="text"
                inputMode="decimal"
                defaultValue={
                  profile?.monthly_income_cents != null
                    ? dollarsFromCents(profile.monthly_income_cents)
                    : ""
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                Drives the buffer/runway, commitment-load, and shock-resilience
                sub-scores.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                id="currency"
                name="currency"
                defaultValue={profile?.currency ?? DEFAULT_CURRENCY}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Display label only — Signal doesn&apos;t convert between
                currencies.
              </p>
            </div>
            <SubmitButton>Save changes</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your sign-in email. Changing it requires confirming from the new
            inbox.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Current email</Label>
            <p className="font-mono text-sm">{user.email}</p>
          </div>
          <form
            action={requestEmailChange}
            className="space-y-4 border-t pt-4"
          >
            <div className="space-y-2">
              <Label htmlFor="new_email">New email</Label>
              <Input
                id="new_email"
                name="new_email"
                type="email"
                required
                placeholder="new@example.com"
                autoComplete="email"
              />
            </div>
            <SubmitButton variant="outline" pendingLabel="Sending…">
              Send confirmation link
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete your account and all data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={deleteAccount} className="space-y-4">
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p>This permanently deletes:</p>
              <ul className="ml-5 list-disc text-muted-foreground">
                <li>Your sign-in identity</li>
                <li>All accounts, transactions, and signal snapshots</li>
                <li>Any custom category rules you&apos;ve created</li>
              </ul>
              <p className="text-foreground">
                There is no undo and the data cannot be recovered.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">
                Type <strong className="font-mono">DELETE</strong> to confirm
              </Label>
              <Input
                id="confirm"
                name="confirm"
                required
                placeholder="DELETE"
                autoComplete="off"
                pattern="DELETE"
              />
            </div>
            <SubmitButton variant="destructive" pendingLabel="Deleting…">
              Permanently delete account
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Signed in as <code>{user.email}</code>.
      </p>
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return (
    <div className={`rounded-lg border ${cls} px-3 py-2 text-sm`}>
      {children}
    </div>
  );
}
