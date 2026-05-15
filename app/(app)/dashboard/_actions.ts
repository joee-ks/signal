"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateSampleTransactions } from "@/lib/sample-data";

/**
 * Seeds a "Sample Checking" account and ~3 months of realistic transactions
 * for the current user. Idempotent-ish: only runs if the user has zero
 * non-archived accounts.
 */
export async function loadSampleData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Sum all existing non-archived accounts. If they already have some, no-op.
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_archived", false);

  if ((count ?? 0) > 0) {
    redirect("/dashboard?info=sample_skipped");
  }

  // 1. Create the sample account.
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: "Sample Checking",
      type: "checking",
      current_balance_cents: 320000, // $3,200 starting balance
    })
    .select()
    .single();
  if (accountErr) throw accountErr;

  // 2. Generate and batch-insert transactions.
  const txns = generateSampleTransactions();
  const rows = txns.map((t) => ({
    user_id: user.id,
    account_id: account.id,
    occurred_on: t.occurred_on,
    amount_cents: t.amount_cents,
    description: t.description,
    merchant: t.merchant,
    category: t.category,
    bucket: t.bucket,
    is_recurring: t.is_recurring,
    source: "manual" as const,
  }));

  // Supabase has a row limit per insert; chunk to be safe.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from("transactions").insert(chunk);
    if (error) throw error;
  }

  // If the user hasn't set income yet, give them a reasonable default so the
  // intelligence engine has something to work with later.
  const { data: profile } = await supabase
    .from("profiles")
    .select("monthly_income_cents, onboarded_at")
    .eq("id", user.id)
    .single();
  if (profile && profile.monthly_income_cents == null) {
    await supabase
      .from("profiles")
      .update({
        monthly_income_cents: 480000, // ~$4,800/mo, matches the sample paycheck cadence
        onboarded_at: profile.onboarded_at ?? new Date().toISOString(),
      })
      .eq("id", user.id);
  }

  redirect("/dashboard?info=sample_loaded");
}
