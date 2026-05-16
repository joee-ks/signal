"use client";

import { Suspense, useState } from "react";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    const supabase = createClient();
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
                  onClick={() => setSent(false)}
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
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </div>
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
