"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";
import { bucketFor } from "@/lib/categories";
import { todayYmd, addDaysToYmd } from "@/lib/timezone";

const baseSchema = z.object({
  account_id: z.string().uuid(),
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => {
      // No future-dating. The intelligence engine assumes all transactions
      // are in the past — a future-dated row would skew month-to-date totals,
      // forecasts, and anomaly detection. App "today" is US Eastern; allow
      // 1 day of slop in case a user in a different timezone slips through.
      return d <= addDaysToYmd(todayYmd(), 1);
    }, "Date cannot be in the future."),
  direction: z.enum(["in", "out"]),
  amount: z.string().trim().min(1),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  category: z.string().trim().min(1).max(40),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.extend({ id: z.string().uuid() });
const idSchema = z.object({ id: z.string().uuid() });

type SupaClient = Awaited<ReturnType<typeof createClient>>;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function buildTxnRow(parsed: z.infer<typeof baseSchema>) {
  const dollars = centsFromDollarString(parsed.amount);
  if (dollars == null) throw new Error("Amount must be a number.");
  const magnitude = Math.abs(dollars);
  const amount_cents = parsed.direction === "in" ? magnitude : -magnitude;
  return {
    account_id: parsed.account_id,
    occurred_on: parsed.occurred_on,
    amount_cents,
    description: parsed.description ?? "",
    merchant: parsed.description?.trim() || null,
    category: parsed.category,
    bucket: bucketFor(parsed.category),
    source: "manual" as const,
  };
}

/**
 * Apply a delta to an account's current_balance_cents. Read-modify-write —
 * not strictly atomic, but RLS ensures cross-user safety, and the SubmitButton
 * prevents same-user double-fires from the UI. Used by manual add/edit/delete
 * so the displayed balance tracks reality as the user logs new activity.
 */
async function adjustBalance(
  supabase: SupaClient,
  accountId: string,
  delta: number,
) {
  if (delta === 0) return;
  const { data: account } = await supabase
    .from("accounts")
    .select("current_balance_cents")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return;
  await supabase
    .from("accounts")
    .update({
      current_balance_cents:
        (account.current_balance_cents ?? 0) + delta,
    })
    .eq("id", accountId);
}

export async function createTransaction(formData: FormData) {
  const parsed = createSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const row = buildTxnRow(parsed);

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    ...row,
  });
  if (error) throw error;

  await adjustBalance(supabase, row.account_id, row.amount_cents);
  redirect("/transactions");
}

export async function updateTransaction(formData: FormData) {
  const parsed = updateSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const newRow = buildTxnRow(parsed);

  // Fetch old values to compute balance delta(s).
  const { data: old } = await supabase
    .from("transactions")
    .select("account_id, amount_cents")
    .eq("id", parsed.id)
    .maybeSingle();
  if (!old) throw new Error("Transaction not found.");

  const { error } = await supabase
    .from("transactions")
    .update(newRow)
    .eq("id", parsed.id);
  if (error) throw error;

  if (old.account_id !== newRow.account_id) {
    // Moved between accounts: revert on the old, apply on the new.
    await adjustBalance(supabase, old.account_id, -old.amount_cents);
    await adjustBalance(supabase, newRow.account_id, newRow.amount_cents);
  } else {
    const delta = newRow.amount_cents - old.amount_cents;
    if (delta !== 0) {
      await adjustBalance(supabase, newRow.account_id, delta);
    }
  }
  redirect("/transactions");
}

export async function deleteTransaction(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();

  const { data: old } = await supabase
    .from("transactions")
    .select("account_id, amount_cents")
    .eq("id", id)
    .maybeSingle();
  if (!old) throw new Error("Transaction not found.");

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);
  if (error) throw error;

  await adjustBalance(supabase, old.account_id, -old.amount_cents);
  redirect("/transactions");
}
