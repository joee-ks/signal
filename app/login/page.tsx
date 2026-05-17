"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Mode = "signin" | "signup";

/**
 * Auth strategy after dropping email_has_account (migration 0003):
 *
 *   - Sign-in mode calls signInWithOtp with shouldCreateUser: false. If the
 *     email isn't registered, Supabase returns a "Signups not allowed"
 *     error which we catch and surface as a friendly "no account found"
 *     banner. Enumeration via this path is bounded by Supabase's built-in
 *     auth rate limits (~30/hr per email, ~10/min per IP), and every
 *     successful guess sends a real OTP to the victim — so mass scraping
 *     is spam-flavored and costly. Acceptable trade-off vs the easy
 *     enumeration the dropped RPC enabled.
 *
 *   - Sign-up mode calls signInWithOtp with shouldCreateUser: true and
 *     gets no signal back about whether the email was already registered.
 *     If it was, Supabase silently sends a sign-in link instead of a
 *     sign-up confirmation; the user clicks it and lands in their
 *     existing account. No explicit "already registered" warning is
 *     possible without re-introducing an enumeration vector. Acceptable
 *     because the experience still works — just without a callout.
 */
const COPY: Record<
  Mode,
  {
    title: string;
    description: string;
    submit: string;
    submitting: string;
    sentTitle: string;
    sentDescription: (email: string) => React.ReactNode;
    switchPrompt: string;
    switchLink: string;
    switchHref: string;
  }
> = {
  signin: {
    title: "Sign in",
    description:
      "Enter your email and we'll send you a secure sign-in link — no password needed.",
    submit: "Send sign-in link",
    submitting: "Sending…",
    sentTitle: "Check your email",
    sentDescription: (email) => (
      <>
        We sent a sign-in link to <strong>{email}</strong>. Open it on this
        device to continue.
      </>
    ),
    switchPrompt: "New to Signal?",
    switchLink: "Create an account",
    switchHref: "/login?mode=signup",
  },
  signup: {
    title: "Create your account",
    description:
      "Enter your email and we'll send you a sign-up link — no password needed.",
    submit: "Create account",
    submitting: "Sending…",
    sentTitle: "Check your email",
    sentDescription: (email) => (
      <>
        We sent a link to <strong>{email}</strong>. Open it on this device to
        finish creating your account. If you already have one, the same link
        will sign you in.
      </>
    ),
    switchPrompt: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
  },
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const mode: Mode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Only used in sign-in mode — set when the entered email isn't registered.
  const [noAccount, setNoAccount] = useState(false);

  // Reset transient state when the user switches between sign-in and sign-up.
  // The component instance is preserved across the URL change, so without this
  // a stale flag from the previous mode would leak through.
  useEffect(() => {
    setNoAccount(false);
    setSent(false);
    setLoading(false);
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setNoAccount(false);
    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        // Sign-up creates the user if needed; sign-in requires the user to
        // already exist (lets us detect "no account" without an RPC).
        shouldCreateUser: mode === "signup",
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);

    if (error) {
      // In sign-in mode, shouldCreateUser:false yields a specific error when
      // the email isn't in auth.users. The exact string varies across SDK
      // versions, so match loosely on the keywords we know appear in it.
      if (mode === "signin") {
        const msg = error.message?.toLowerCase() ?? "";
        if (
          msg.includes("signup") ||
          msg.includes("not allowed") ||
          msg.includes("not found") ||
          msg.includes("does not exist")
        ) {
          setNoAccount(true);
          return;
        }
      }
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Signal
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            Find the signal in your spending.
          </p>
        </div>

        <Card>
          {sent ? (
            <>
              <CardHeader>
                <CardTitle>{copy.sentTitle}</CardTitle>
                <CardDescription>
                  {copy.sentDescription(email.trim())}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(false);
                    setNoAccount(false);
                  }}
                >
                  Use a different email
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{copy.title}</CardTitle>
                <CardDescription>{copy.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (noAccount) setNoAccount(false);
                      }}
                      required
                      disabled={loading}
                    />
                  </div>
                  {noAccount && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                      No Signal account is registered to that email.{" "}
                      <Link
                        href="/login?mode=signup"
                        className="font-medium underline underline-offset-4 hover:text-foreground"
                      >
                        Create an account →
                      </Link>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? copy.submitting : copy.submit}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          {copy.switchPrompt}{" "}
          <Link
            href={copy.switchHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {copy.switchLink}
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Signal provides information, not financial advice.
        </p>
      </div>
    </main>
  );
}
