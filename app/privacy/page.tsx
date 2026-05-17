import Link from "next/link";

export const metadata = { title: "Privacy" };

const EFFECTIVE_DATE = "May 16, 2026";

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 sm:py-24">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Signal
        </Link>

        <article className="mt-8 space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Privacy
            </h1>
            <p className="text-sm text-muted-foreground">
              Effective {EFFECTIVE_DATE}
            </p>
          </header>

          <p className="text-base leading-relaxed">
            Signal is a personal-finance intelligence tool. The short
            version: we collect what we need to make the app work, store it
            with row-level security so only you can read it, and don&apos;t
            sell it, share it for advertising, or mine it for anything
            unrelated to your dashboard. Below is the long version.
          </p>

          <Section title="What we collect">
            <ul className="ml-5 list-disc space-y-1.5 text-sm">
              <li>
                <strong>Your email address.</strong> Used to sign you in via
                one-time magic links — there&apos;s no password.
              </li>
              <li>
                <strong>Profile values you enter.</strong> Display name,
                monthly income, currency preference.
              </li>
              <li>
                <strong>Accounts and transactions you create.</strong> Names,
                balances, dates, amounts, descriptions, categories. Signal
                only stores what you type in — it does not connect to your
                bank.
              </li>
              <li>
                <strong>Operational metadata.</strong> Account creation
                timestamps, the cached output of your most recent
                intelligence run.
              </li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              We do not collect IP addresses for analytics, install
              third-party trackers, fingerprint your browser, or use any
              advertising SDKs.
            </p>
          </Section>

          <Section title="How it&rsquo;s stored">
            <p className="text-sm">
              All your data lives in a Postgres database hosted by{" "}
              <strong>Supabase</strong>. Every row is tagged with your user
              ID and protected by Postgres Row-Level Security policies that
              make it readable only by you. Other Signal users — including
              the project maintainer — cannot read your accounts or
              transactions through the normal app.
            </p>
          </Section>

          <Section title="Who we share it with">
            <p className="text-sm">
              Signal sends data to three third parties, each for a specific
              purpose:
            </p>
            <ul className="ml-5 mt-2 list-disc space-y-1.5 text-sm">
              <li>
                <strong>Supabase</strong> — hosts the database and handles
                authentication. Receives everything you enter.
              </li>
              <li>
                <strong>Anthropic (Claude)</strong> — generates the
                plain-English narrative on your dashboard. Receives only
                aggregated metrics, pattern summaries, and the merchant
                labels of your top recurring charges (e.g.{" "}
                <code>NETFLIX.COM</code>) so the narrative can reference
                them by name. Individual one-off transactions and
                non-recurring descriptions are never sent.
              </li>
              <li>
                <strong>Vercel</strong> — hosts the application code that
                serves pages to your browser. Sees request metadata
                (timestamps, paths) but not your database contents.
              </li>
            </ul>
            <p className="mt-3 text-sm">
              We do not sell your data to anyone, ever. We do not share it
              with advertisers, data brokers, or analytics vendors.
            </p>
          </Section>

          <Section title="Cookies">
            <p className="text-sm">
              Signal uses session cookies set by Supabase to keep you signed
              in. They are <code>httpOnly</code>, scoped to the Signal
              domain, and expire when your session does. There are no
              advertising or analytics cookies.
            </p>
          </Section>

          <Section title="Your data, your control">
            <p className="text-sm">
              You can delete your account and all associated data at any
              time from the{" "}
              <Link
                href="/settings"
                className="font-medium underline-offset-4 hover:underline"
              >
                settings page
              </Link>
              . Deletion is immediate and irreversible — your profile,
              accounts, transactions, custom category rules, and cached
              intelligence snapshots are all removed.
            </p>
          </Section>

          <Section title="Changes">
            <p className="text-sm">
              If this policy changes materially, the effective date at the
              top of this page will update. Material changes will also be
              announced in the{" "}
              <a
                href="https://github.com/joee-ks/signal"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline-offset-4 hover:underline"
              >
                project repository
              </a>
              .
            </p>
          </Section>

          <Section title="Contact">
            <p className="text-sm">
              Signal is a personal project, not a company. For questions or
              concerns, open an issue on the{" "}
              <a
                href="https://github.com/joee-ks/signal/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline-offset-4 hover:underline"
              >
                project repository
              </a>
              .
            </p>
          </Section>
        </article>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>Signal provides information, not financial advice.</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
