import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "./_actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { dollarsFromCents } from "@/lib/format";

export default async function SettingsPage(props: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await props.searchParams;
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
          Manage your profile and preferences.
        </p>
      </div>

      {saved === "1" && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Saved.
        </div>
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
            <SubmitButton>Save changes</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="text-base">Coming in Phase 5</CardTitle>
          <CardDescription>
            Change email, change currency, and delete your account & all data.
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-xs text-muted-foreground">
        Signed in as <code>{user.email}</code>.
      </p>
    </div>
  );
}
