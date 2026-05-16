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
