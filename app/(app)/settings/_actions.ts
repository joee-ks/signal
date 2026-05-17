"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsFromDollarString } from "@/lib/format";
import { SUPPORTED_CURRENCIES } from "@/lib/profile";

const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [
  string,
  ...string[],
];

const profileSchema = z.object({
  display_name: z.string().trim().max(80).optional().or(z.literal("")),
  monthly_income: z.string().trim().min(1),
  currency: z.enum(CURRENCY_CODES as unknown as readonly [string, ...string[]]),
});

const emailSchema = z.object({
  new_email: z.string().trim().email(),
});

const deleteSchema = z.object({
  confirm: z.literal("DELETE"),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function updateProfile(formData: FormData) {
  const parsed = profileSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();

  const incomeCents = centsFromDollarString(parsed.monthly_income);
  if (incomeCents == null || incomeCents < 0) {
    throw new Error("Monthly income must be a positive number.");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.display_name || null,
      monthly_income_cents: incomeCents,
      currency: parsed.currency,
    })
    .eq("id", user.id);
  if (error) throw error;
  redirect("/settings?saved=1");
}

export async function requestEmailChange(formData: FormData) {
  const parsed = emailSchema.parse(Object.fromEntries(formData));
  const { supabase, user } = await requireUser();

  if (parsed.new_email.toLowerCase() === (user.email ?? "").toLowerCase()) {
    redirect("/settings?info=email_unchanged");
  }

  // Build the absolute origin for the confirmation link from our own
  // env var rather than the request's Host header — Host is attacker-
  // controllable in some configurations, and a forged value would route
  // the confirmation link (and its token) to an attacker-controlled
  // domain. NEXT_PUBLIC_SITE_URL is set by us per environment.
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const { error } = await supabase.auth.updateUser(
    { email: parsed.new_email },
    { emailRedirectTo: `${origin}/auth/confirm` },
  );
  if (error) {
    redirect(
      `/settings?info=email_change_failed&message=${encodeURIComponent(error.message)}`,
    );
  }
  redirect("/settings?info=email_change_sent");
}

export async function deleteAccount(formData: FormData) {
  // Throws if `confirm` isn't exactly "DELETE".
  deleteSchema.parse(Object.fromEntries(formData));

  const { supabase, user } = await requireUser();

  // Delete the auth.users row via the service-role client. RLS + the
  // `on delete cascade` constraints in our schema fan that out to
  // profiles / accounts / transactions / category_rules /
  // signals_snapshots automatically.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;

  // Clear the local session cookies. The Supabase API call may fail with
  // a 401 since the user no longer exists — that's expected, the
  // important part is that @supabase/ssr clears the cookies.
  try {
    await supabase.auth.signOut();
  } catch {
    // ignore — the auth row is gone, cookies will be replaced by the
    // proxy on the next request anyway.
  }

  redirect("/?deleted=1");
}
