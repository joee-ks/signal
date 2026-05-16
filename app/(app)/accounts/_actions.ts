"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";

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
  const { supabase } = await requireUser();
  const balanceCents = centsFromDollarString(parsed.balance) ?? 0;
  const { error } = await supabase
    .from("accounts")
    .update({
      name: parsed.name,
      type: parsed.type,
      current_balance_cents: balanceCents,
    })
    .eq("id", parsed.id);
  if (error) throw error;
  redirect("/accounts");
}

export async function archiveAccount(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: true })
    .eq("id", id);
  if (error) throw error;
  redirect("/accounts");
}

export async function unarchiveAccount(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("accounts")
    .update({ is_archived: false })
    .eq("id", id);
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
    .maybeSingle();
  if (!account) throw new Error("Account not found.");

  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);
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
      .eq("account_id", id);
    if (txErr) throw txErr;
  }

  const { error } = await supabase.from("accounts").delete().eq("id", id);
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
