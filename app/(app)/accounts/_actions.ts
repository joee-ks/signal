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
 * Hard-delete an account. Refuses if the account has any transactions —
 * use archive for those instead. Intended for cleaning up accidental dupes.
 */
export async function deleteAccount(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id);
  if ((count ?? 0) > 0) {
    throw new Error(
      "Account has transactions — archive it instead of deleting.",
    );
  }
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw error;
  redirect("/accounts");
}
