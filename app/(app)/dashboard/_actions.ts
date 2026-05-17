"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { detectSamplePersona, getPersona } from "@/lib/sample-data";
import {
  fetchAndComputeIntelligence,
  getOrGenerateNarrative,
} from "@/lib/intelligence/snapshot";
import { getUserCurrency } from "@/lib/profile";

export async function recomputeNarrative() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [intel, currency, accountsQ] = await Promise.all([
    fetchAndComputeIntelligence(supabase, user.id),
    getUserCurrency(supabase, user.id),
    supabase
      .from("accounts")
      .select("name, is_archived")
      .eq("user_id", user.id),
  ]);

  // Sample personas use a pre-baked narrative — recompute would burn a
  // Claude call to produce the same canned output. Detect and short-circuit.
  const samplePersonaId = detectSamplePersona(accountsQ.data ?? []);

  // Throttle real-data recomputes atomically. The previous read-then-check
  // pattern raced: two parallel requests could both observe the snapshot as
  // old enough and both call Claude. New pattern: an upsert ensures a row
  // exists (with an epoch timestamp on first compute) so the conditional
  // UPDATE below has something to claim; then a single UPDATE bumps
  // generated_at iff the existing value is older than the throttle window.
  // Parallel requests race on the UPDATE — exactly one wins (1 row
  // returned), the others see 0 rows and get throttled. Sample mode is
  // exempt since it doesn't call Claude.
  if (!samplePersonaId) {
    await supabase.from("signals_snapshots").upsert(
      {
        user_id: user.id,
        period: "live",
        generated_at: new Date(0).toISOString(),
      },
      { onConflict: "user_id,period", ignoreDuplicates: true },
    );
    const sixtyAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: claimed } = await supabase
      .from("signals_snapshots")
      .update({ generated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("period", "live")
      .lt("generated_at", sixtyAgo)
      .select("user_id");
    if (!claimed?.length) {
      redirect("/dashboard?info=recompute_throttled");
    }
  }

  await getOrGenerateNarrative(supabase, user.id, intel, {
    force: true,
    currency,
    samplePersonaId,
  });
  redirect("/dashboard?info=recomputed");
}

/**
 * Load (or swap to) a sample persona. Wipes any existing sample data first so
 * personas can be swapped one-click. Refuses if the user has any real
 * (non-sample) transactions, to avoid mixing test and real data.
 *
 * "Sample" accounts are identified by name prefix "Sample".
 */
export async function loadSampleData(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawPersona = formData.get("persona");
  const persona = getPersona(typeof rawPersona === "string" ? rawPersona : null);

  // 1. Refuse if the user has any active account they created themselves
  //    (non-Sample prefix, non-archived) — they're past sample exploration,
  //    and we don't want sample data alongside their real history.
  const { data: ownAccts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .not("name", "ilike", "Sample%");
  if ((ownAccts ?? []).length > 0) {
    redirect("/dashboard?info=sample_skipped");
  }

  // 2. Identify existing Sample-prefixed accounts. Used for two things:
  //    (a) the wipe + reseed below, and (b) a 30s throttle — each persona
  //    swap issues ~150 inserts, so a spam loop would churn the DB hard.
  //    30s is plenty for a curious user to pick the next persona but
  //    enough friction to deter scripted abuse.
  const { data: sampleAccts } = await supabase
    .from("accounts")
    .select("id, created_at")
    .eq("user_id", user.id)
    .ilike("name", "Sample%")
    .order("created_at", { ascending: false });
  const sampleAccountIds = (sampleAccts ?? []).map(
    (a) => a.id as string,
  );
  const lastSampleCreatedAt = (sampleAccts ?? [])[0]?.created_at as
    | string
    | undefined;
  if (lastSampleCreatedAt) {
    const ageSec =
      (Date.now() - new Date(lastSampleCreatedAt).getTime()) / 1000;
    if (ageSec < 30) {
      redirect("/dashboard?info=sample_throttled");
    }
  }

  // 3. Wipe existing sample data (txns first due to FK, then accounts).
  if (sampleAccountIds.length > 0) {
    await supabase
      .from("transactions")
      .delete()
      .in("account_id", sampleAccountIds);
    await supabase.from("accounts").delete().in("id", sampleAccountIds);
  }

  // 4. Invalidate any cached narrative — the shape will change anyway.
  await supabase
    .from("signals_snapshots")
    .delete()
    .eq("user_id", user.id);

  // 5. Create the new sample account.
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: `Sample Checking (${persona.label})`,
      type: "checking",
      current_balance_cents: persona.starting_balance_cents,
    })
    .select("id")
    .single();
  if (accountErr) throw accountErr;

  // 6. Stamp the persona's income on the profile (and mark onboarded if not).
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  await supabase
    .from("profiles")
    .update({
      monthly_income_cents: persona.monthly_income_cents,
      onboarded_at: profile?.onboarded_at ?? new Date().toISOString(),
    })
    .eq("id", user.id);

  // 7. Generate and batch-insert transactions (tagged source='sample').
  const txns = persona.generate();
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
    source: "sample" as const,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from("transactions")
      .insert(rows.slice(i, i + 200));
    if (error) throw error;
  }

  redirect(`/dashboard?info=sample_loaded&persona=${persona.id}`);
}
