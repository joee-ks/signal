"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { centsFromDollarString } from "@/lib/format";

const schema = z.object({
  display_name: z.string().trim().max(80).optional().or(z.literal("")),
  monthly_income: z.string().trim().min(1),
});

export async function updateProfile(formData: FormData) {
  const parsed = schema.parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const incomeCents = centsFromDollarString(parsed.monthly_income);
  if (incomeCents == null || incomeCents < 0) {
    throw new Error("Monthly income must be a positive number.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.display_name || null,
      monthly_income_cents: incomeCents,
    })
    .eq("id", user.id);
  if (error) throw error;
  redirect("/settings?saved=1");
}
