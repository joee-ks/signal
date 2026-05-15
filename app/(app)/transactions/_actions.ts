"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";
import { bucketFor } from "@/lib/categories";

const baseSchema = z.object({
  account_id: z.string().uuid(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["in", "out"]),
  amount: z.string().trim().min(1),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  category: z.string().trim().min(1).max(40),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.extend({ id: z.string().uuid() });
const idSchema = z.object({ id: z.string().uuid() });

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

export async function createTransaction(formData: FormData) {
  const parsed = createSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();
  const row = buildTxnRow(parsed);
  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    ...row,
  });
  if (error) throw error;
  redirect("/transactions");
}

export async function updateTransaction(formData: FormData) {
  const parsed = updateSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const row = buildTxnRow(parsed);
  const { error } = await supabase
    .from("transactions")
    .update(row)
    .eq("id", parsed.id);
  if (error) throw error;
  redirect("/transactions");
}

export async function deleteTransaction(formData: FormData) {
  const { id } = idSchema.parse(Object.fromEntries(formData));
  const { supabase } = await requireUser();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
  redirect("/transactions");
}
