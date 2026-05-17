"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";
import { CATEGORIES, bucketFor } from "@/lib/categories";
import { todayYmd, addDaysToYmd } from "@/lib/timezone";

// Tuple form required by z.enum — derived from the canonical CATEGORIES
// list so the validator and the UI dropdown can never drift apart.
const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as unknown as readonly [
  string,
  ...string[],
];

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
  // Whitelist against the canonical list — prevents arbitrary strings from
  // landing in the DB and flowing through to the Claude prompt later.
  category: z.enum(CATEGORY_VALUES),
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
 * Apply a delta to an account's current_balance_cents atomically via the
 * adjust_account_balance RPC (migration 0005). The RPC is SECURITY INVOKER
 * so RLS still scopes the update to the caller's own accounts. The userId
 * argument is no longer strictly needed by the RPC itself (RLS handles
 * cross-user safety), but we keep it in the signature so callers stay
 * explicit about who they're acting as.
 */
async function adjustBalance(
  supabase: SupaClient,
  _userId: string,
  accountId: string,
  delta: number,
) {
  if (delta === 0) return;
  await supabase.rpc("adjust_account_balance", {
    p_account_id: accountId,
    p_delta: delta,
  });
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

  await adjustBalance(supabase, user.id, row.account_id, row.amount_cents);
  redirect("/transactions");
}

export async function updateTransaction(formData: FormData) {
  const parsed = updateSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const newRow = buildTxnRow(parsed);

  // Fetch old values to compute balance delta(s). Explicit user_id filter
  // ensures defense in depth — RLS would also block cross-user reads.
  const { data: old } = await supabase
    .from("transactions")
    .select("account_id, amount_cents")
    .eq("id", parsed.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!old) throw new Error("Transaction not found.");

  const { error } = await supabase
    .from("transactions")
    .update(newRow)
    .eq("id", parsed.id)
    .eq("user_id", user.id);
  if (error) throw error;

  if (old.account_id !== newRow.account_id) {
    // Moved between accounts: revert on the old, apply on the new.
    await adjustBalance(supabase, user.id, old.account_id, -old.amount_cents);
    await adjustBalance(supabase, user.id, newRow.account_id, newRow.amount_cents);
  } else {
    const delta = newRow.amount_cents - old.amount_cents;
    if (delta !== 0) {
      await adjustBalance(supabase, user.id, newRow.account_id, delta);
    }
  }
  redirect("/transactions");
}

export async function deleteTransaction(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();

  const { data: old } = await supabase
    .from("transactions")
    .select("account_id, amount_cents")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!old) throw new Error("Transaction not found.");

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;

  await adjustBalance(supabase, user.id, old.account_id, -old.amount_cents);
  redirect("/transactions");
}
