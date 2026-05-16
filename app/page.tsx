import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function Home(props: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await props.searchParams;
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16 sm:py-24">
        {deleted === "1" && (
          <div className="mx-auto mb-8 max-w-2xl rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-700 dark:text-emerald-300">
            Your account and all data were permanently deleted.
          </div>
        )}
        {/* Hero */}
        <section className="flex flex-col items-center gap-6 text-center">
          <span className="inline-block rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            Financial health &amp; intelligence
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Find the signal in your spending.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-balance">
            Signal filters financial noise into meaningful signals that guide
            better decisions. Not a budgeter. Not a tracker. Not an advisor —
            intelligence about your money.
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              render={<Link href="/login">Get started — it&apos;s free</Link>}
              size="lg"
            />
            <Button
              render={<Link href="/login">I have an account</Link>}
              size="lg"
              variant="outline"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            No password — sign in with a one-time link to your email.
          </p>
        </section>

        {/* Benefit blocks */}
        <section className="mt-24 grid gap-4 sm:grid-cols-3">
          <BenefitCard
            title="Find the signal"
            description="Subscription creep, lifestyle inflation, anomalies vs. your own baseline — surfaced automatically as you go."
          />
          <BenefitCard
            title="Quantify your health"
            description="A single 0–100 Financial Health Score broken down into the five sub-scores that actually drive resilience."
          />
          <BenefitCard
            title="Forecast the risk"
            description="See your projected end-of-month balance, your runway in months, and what breaks first if income drops."
          />
        </section>

        {/* How it works */}
        <section className="mt-24">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <Step
              n={1}
              title="Add your accounts"
              description="Type in your accounts and current balances. Your data stays in your account — protected by per-row security."
            />
            <Step
              n={2}
              title="Log activity"
              description="Add transactions yourself or import a bank export. Common merchants get auto-categorized out of the box."
            />
            <Step
              n={3}
              title="See your signals"
              description="Every dashboard load recomputes your score, patterns, and forecast. Read the headline; act when something stands out."
            />
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-24 flex flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Replace guesswork with intelligence.
          </h2>
          <Button render={<Link href="/login">Get started</Link>} size="lg" />
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>Signal provides information, not financial advice.</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <span className="opacity-50">Privacy · Terms (coming soon)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function BenefitCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function Step({
  n,
  title,
  description,
}: {
  n: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-2 text-center">
      <div className="mx-auto flex size-8 items-center justify-center rounded-full border text-sm font-medium tabular-nums text-muted-foreground">
        {n}
      </div>
      <h3 className="text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
