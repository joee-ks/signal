"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";

const schema = z.object({
  display_name: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  monthly_income: z.string().trim().min(1),
  account_name: z.string().trim().min(1).max(80),
  account_type: z.enum(["checking", "savings", "credit", "cash", "other"]),
  account_balance: z.string().trim(),
});

export async function completeOnboarding(formData: FormData) {
  const parsed = schema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Idempotency: if the user has already completed onboarding, do nothing.
  // This makes the action safe against double-submits / browser retries.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (profile?.onboarded_at) {
    redirect("/dashboard");
  }

  const incomeCents = centsFromDollarString(parsed.monthly_income);
  const balanceCents = centsFromDollarString(parsed.account_balance) ?? 0;
  if (incomeCents == null || incomeCents < 0) {
    throw new Error("Monthly income must be a number.");
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.display_name || null,
      monthly_income_cents: incomeCents,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profileErr) throw profileErr;

  const { error: accountErr } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: parsed.account_name,
    type: parsed.account_type,
    current_balance_cents: balanceCents,
  });
  if (accountErr) throw accountErr;

  redirect("/dashboard");
}

/**
 * Bypass the onboarding form — marks the profile onboarded without setting
 * income or creating an account. The user lands on the dashboard's empty
 * state where they can load a sample persona or wire up their own accounts
 * from `/accounts/new` and update income later via `/settings`.
 */
export async function skipOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (profile?.onboarded_at) {
    redirect("/dashboard");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) throw error;
  redirect("/dashboard");
}
