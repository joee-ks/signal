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
    wrongModeMessage: string;
    wrongModeLink: string;
    wrongModeHref: string;
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
    wrongModeMessage: "No Signal account is registered to that email.",
    wrongModeLink: "Create an account",
    wrongModeHref: "/login?mode=signup",
  },
  signup: {
    title: "Create your account",
    description:
      "Enter your email and we'll send you a sign-up link — no password needed.",
    submit: "Create account",
    submitting: "Sending…",
    sentTitle: "Confirm your email",
    sentDescription: (email) => (
      <>
        We sent a confirmation link to <strong>{email}</strong>. Open it on
        this device to finish creating your account.
      </>
    ),
    switchPrompt: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
    wrongModeMessage: "That email is already registered.",
    wrongModeLink: "Sign in instead",
    wrongModeHref: "/login",
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
  const [wrongMode, setWrongMode] = useState(false);

  // Reset transient state when the user switches between sign-in and sign-up.
  // The component instance is preserved across the URL change, so without this
  // a stale wrongMode/sent from the previous mode would leak through.
  useEffect(() => {
    setWrongMode(false);
    setSent(false);
    setLoading(false);
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setWrongMode(false);
    setLoading(true);
    const supabase = createClient();

    // Pre-flight: does the email already have an account? Drives the
    // "already registered" vs "no account found" guidance for each mode.
    // If the RPC itself fails (e.g. migration not run yet), we fall through
    // to the normal flow so the page stays usable.
    const { data: existsRaw } = await supabase.rpc("email_has_account", {
      p_email: trimmed,
    });
    const exists = typeof existsRaw === "boolean" ? existsRaw : null;

    if (mode === "signup" && exists === true) {
      setLoading(false);
      setWrongMode(true);
      return;
    }
    if (mode === "signin" && exists === false) {
      setLoading(false);
      setWrongMode(true);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    setLoading(false);
    if (error) {
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
                    setWrongMode(false);
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
                        if (wrongMode) setWrongMode(false);
                      }}
                      required
                      disabled={loading}
                    />
                  </div>
                  {wrongMode && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                      {copy.wrongModeMessage}{" "}
                      <Link
                        href={copy.wrongModeHref}
                        className="font-medium underline underline-offset-4 hover:text-foreground"
                      >
                        {copy.wrongModeLink} →
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
