"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";
import { MAX_ACCOUNTS_PER_USER } from "@/lib/profile";

const ACCOUNT_TYPES = ["checking", "savings", "credit", "cash", "other"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(ACCOUNT_TYPES),
  balance: z.string().trim(),
});

const updateSchema = createSchema.extend({
  id: z.string().uuid(),
});

const idSchema = z.object({ id: z.string().uuid() });

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createAccount(formData: FormData) {
  const parsed = createSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const balanceCents = centsFromDollarString(parsed.balance) ?? 0;

  // Auto-wipe any Sample-prefixed accounts: creating an own account means
  // the user is past sample-data exploration, and we don't want sample
  // transactions polluting the engine alongside their real history.
  const { data: sampleAccts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .ilike("name", "Sample%");
  const sampleIds = (sampleAccts ?? []).map((a) => a.id as string);
  if (sampleIds.length > 0) {
    await supabase
      .from("transactions")
      .delete()
      .in("account_id", sampleIds);
    await supabase.from("accounts").delete().in("id", sampleIds);
    // The cached narrative was based on sample data — invalidate it.
    await supabase
      .from("signals_snapshots")
      .delete()
      .eq("user_id", user.id);
  }

  // Enforce the soft cap on active accounts. Run AFTER the sample wipe
  // above so we count only what the user really has post-cleanup —
  // otherwise sample accounts (which we're about to delete) would
  // unfairly push them over the limit.
  const { count: activeCount } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_archived", false);
  if ((activeCount ?? 0) >= MAX_ACCOUNTS_PER_USER) {
    redirect("/accounts?info=account_limit");
  }

  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: parsed.name,
    type: parsed.type,
    current_balance_cents: balanceCents,
  });
  if (error) throw error;
  redirect("/accounts");
}

export async function updateAccount(formData: FormData) {
  const parsed = updateSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const balanceCents = centsFromDollarString(parsed.balance) ?? 0;
  const { error } = await supabase
    .from("accounts")
    .update({
      name: parsed.name,
      type: parsed.type,
      current_balance_cents: balanceCents,
    })
    .eq("id", parsed.id)
    .eq("user_id", user.id);
  if (error) throw error;
  redirect("/accounts");
}

export async function archiveAccount(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  redirect("/accounts");
}

export async function unarchiveAccount(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: false })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;
  redirect("/accounts");
}

/**
 * Hard-delete an account.
 *   - Active account, no transactions → delete (no confirm required)
 *   - Active account, has transactions → refuse; user must archive first
 *   - Archived account, any state → delete (cascades transactions);
 *     requires typed "DELETE" confirmation when transactions exist
 */
export async function deleteAccount(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const { id } = idSchema.parse(raw);
  const confirm = typeof raw.confirm === "string" ? raw.confirm : "";
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, is_archived")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) throw new Error("Account not found.");

  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id)
    .eq("user_id", user.id);
  const hasTransactions = (count ?? 0) > 0;

  // Active account with transactions: must archive first.
  if (hasTransactions && !account.is_archived) {
    throw new Error(
      "Account has transactions — archive it before deleting.",
    );
  }

  // Archived account with transactions: require typed confirmation.
  if (hasTransactions && account.is_archived && confirm !== "DELETE") {
    throw new Error("Type DELETE to confirm permanent deletion.");
  }

  // Cascade-delete transactions first (no FK on delete cascade between
  // accounts and transactions; we manage it in app code).
  if (hasTransactions) {
    const { error: txErr } = await supabase
      .from("transactions")
      .delete()
      .eq("account_id", id)
      .eq("user_id", user.id);
    if (txErr) throw txErr;
  }

  const { error } = await supabase
    .from("accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;

  // Invalidate the cached narrative — the underlying intel just changed materially.
  if (hasTransactions) {
    await supabase
      .from("signals_snapshots")
      .delete()
      .eq("user_id", user.id);
  }

  redirect("/accounts");
}
