import type { createClient } from "@/lib/supabase/server";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD — US Dollar" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

/**
 * Soft cap on the number of active (non-archived) accounts per user. The
 * intelligence engine doesn't get more accurate past a handful of accounts —
 * the limit exists to keep the UI tidy and prevent accidental duplicates.
 * Archived accounts don't count against this; they're effectively gone.
 */
export const MAX_ACCOUNTS_PER_USER = 12;

/** Fetch just the user's currency preference. Defaults to USD if unset. */
export async function getUserCurrency(
  supabase: SupaClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", userId)
    .maybeSingle();
  return (
    ((data as { currency?: string | null } | null)?.currency) ??
    DEFAULT_CURRENCY
  );
}
