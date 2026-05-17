import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the email sign-in link. The Supabase email templates are configured
 * to point here, e.g.:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
 * We verify the token server-side, which sets the auth cookies, then redirect
 * into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      // Email change has "secure_email_change" on in Supabase by default,
      // which requires confirming from BOTH the old and new inbox. A
      // single verifyOtp succeeding only confirms one side; the actual
      // user.email doesn't flip until both are done. Route back to
      // settings so the user can see the state (and the "click the other
      // link too" message) instead of dumping them on the dashboard with
      // no feedback.
      if (type === "email_change") {
        return NextResponse.redirect(
          `${origin}/settings?info=email_change_confirmed`,
        );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Email-change failures shouldn't bounce an already-authed user to
    // the login page — keep them on settings with a useful message.
    if (type === "email_change") {
      return NextResponse.redirect(
        `${origin}/settings?info=email_change_invalid&message=${encodeURIComponent(error.message)}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}

/** Only allow same-site relative redirects. */
function sanitizeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}
