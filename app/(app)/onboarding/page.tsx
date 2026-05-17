import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeOnboarding, skipOnboarding } from "./_actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
import { Select } from "@/components/select";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at, display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.onboarded_at) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Signal</CardTitle>
          <CardDescription>
            Two quick things and you&apos;re in. We can refine all of this
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={completeOnboarding} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="display_name">
                What should we call you?{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
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
                Roughly, your monthly take-home pay
              </Label>
              <Input
                id="monthly_income"
                name="monthly_income"
                type="text"
                inputMode="decimal"
                placeholder="3500"
                required
              />
              <p className="text-xs text-muted-foreground">
                After taxes — what hits your account each month. Estimate is
                fine; you can change it later.
              </p>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium">Your first account</p>
                <p className="text-xs text-muted-foreground">
                  Add one to get started — you can add more later.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account_name">Account name</Label>
                  <Input
                    id="account_name"
                    name="account_name"
                    placeholder="Chase Checking"
                    required
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account_type">Type</Label>
                  <Select
                    id="account_type"
                    name="account_type"
                    defaultValue="checking"
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="credit">Credit card</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_balance">Current balance</Label>
                <Input
                  id="account_balance"
                  name="account_balance"
                  type="text"
                  inputMode="decimal"
                  placeholder="1250.00"
                  defaultValue="0"
                />
              </div>
            </div>

            <SubmitButton className="w-full" pendingLabel="Setting up…">
              Finish setup
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not ready?</CardTitle>
          <CardDescription>
            Skip setup and explore Signal with sample data first — pick a
            persona on the dashboard and see how the engine reads ~3 months
            of realistic activity. You can come back and add your income
            and accounts whenever.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={skipOnboarding}>
            <SubmitButton variant="outline" pendingLabel="Skipping…">
              Skip setup and explore samples
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
