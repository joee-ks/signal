import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. **Bypasses Row-Level Security.** Server-side
 * only — never expose this client or its key to the browser.
 *
 * Use exclusively for admin operations that explicitly need to break out of
 * RLS, like deleting a user via `auth.admin.deleteUser`.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
