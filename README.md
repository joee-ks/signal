# Signal

**Find the signal in your spending.**

Signal is a financial health & intelligence app for young adults navigating
financial uncertainty. It filters financial noise into meaningful signals that
guide better decisions — not a budgeter, not a tracker, not an advisor.

The deterministic engine computes a Financial Health Score (0–100), five
sub-scores (buffer, stability, commitment load, discretionary discipline, shock
resilience), six pattern detectors (subscription creep, lifestyle inflation,
income irregularity, etc.), and a short forecast (end-of-month balance,
runway, shock impact). Claude turns the structured output into a plain-language
read on the dashboard.

Live at: https://signal-steel.vercel.app

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (base-nova / Base UI)
- **Supabase** — Postgres, Auth (passwordless magic link), Row-Level Security
- **Anthropic Claude** (`claude-haiku-4-5`) for the narrative layer
- **Vercel** for hosting and CI (auto-deploys on push to `main`)

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` (copy `.env.example`) and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase Settings → API>
   SUPABASE_SERVICE_ROLE_KEY=<service_role key — server only, never expose>
   ANTHROPIC_API_KEY=<sk-ant-... from console.anthropic.com>
   ANTHROPIC_NARRATIVE_MODEL=claude-haiku-4-5
   NEXT_PUBLIC_APP_NAME=Signal
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

3. Set up the Supabase project (see [Supabase setup](#supabase-setup) below).

4. Run the dev server:
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000>.

## Supabase setup

**Database.** Run each file in `supabase/migrations/` in order via the
Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run):

- `0001_init.sql` — schema (profiles, accounts, transactions, category_rules,
  signals_snapshots), Row-Level Security, the new-user trigger, ~140 seeded
  global category rules.
- `0002_email_check.sql` — `email_has_account()` RPC originally used by the
  login page. Superseded by 0003 — run it for historical completeness or
  skip if you're applying migrations fresh.
- `0003_drop_email_check.sql` — drops the RPC from 0002. The login flow now
  uses a uniform auth call that leaks no information about which emails are
  registered (no enumeration via the form).
- `0004_account_cap_trigger.sql` — race-safe enforcement of the 12-account
  cap via a `before insert` trigger that takes a per-user advisory lock.
- `0005_atomic_balance.sql` — `adjust_account_balance(uuid, int)` RPC for
  atomic balance updates, replacing the previous read-modify-write that
  could race under concurrent transaction edits.

**Auth URL configuration.** Dashboard → Authentication → URL Configuration:
- Site URL: your production URL (e.g. `https://signal-steel.vercel.app`)
- Redirect URLs: include both `http://localhost:3000/**` and your prod
  `https://<your-vercel>.vercel.app/**`

**Email templates** — Authentication → Emails → Templates. Edit three:

*Magic Link* and *Confirm signup*:
```html
<h2>Sign in to Signal</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink">Sign in</a></p>
```
(Use `&type=signup` for the Confirm signup template.)

*Change Email Address*:
```html
<h2>Confirm your new Signal email</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email_change">Confirm new email</a></p>
```

**Custom SMTP (recommended for production).** Supabase's built-in mailer is
rate-limited to ~4 emails/hour on the free tier. Connect a provider like
Resend (free tier: 100 emails/day): Authentication → Settings → Custom SMTP
→ host `smtp.resend.com`, port `465`, username `resend`, password is your
Resend API key.

## Deployment

Vercel auto-deploys from `main`. Add all `.env.local` variables to Vercel's
project Environment Variables. After your first deploy, update Supabase's
Site URL + Redirect URLs to include the deployed URL.

## Project structure

```
app/
├── (app)/              authenticated routes (proxy-gated)
│   ├── dashboard/      health-score + narrative + summary
│   ├── signals/        all detected patterns + recurring charges
│   ├── transactions/   list + manual add/edit/delete
│   ├── accounts/       list + add/edit/archive/delete
│   ├── onboarding/     first-run form
│   ├── settings/       display name, income, currency, email change, delete
│   ├── layout.tsx      authed shell + nav
│   └── error.tsx       error boundary for authed area
├── auth/confirm/       magic-link callback (verifyOtp → cookies)
├── login/              passwordless sign-in / sign-up
├── page.tsx            landing
├── layout.tsx          root layout (fonts, Toaster)
├── error.tsx           top-level error boundary
└── icon.svg            favicon

lib/
├── intelligence/       deterministic engine (pure TS)
│   ├── aggregates.ts   monthly buckets, derived income, runway helpers
│   ├── recurring.ts    recurring-charge detection (weekly/bi/monthly/yearly)
│   ├── health-score.ts 5 sub-scores + weighted total
│   ├── patterns.ts     6 pattern detectors
│   ├── forecast.ts     end-of-month, runway, shock-drop
│   ├── narrate.ts      Claude call (tool-use, structured output)
│   ├── snapshot.ts     shape-hash caching in signals_snapshots
│   └── index.ts        orchestrator (computeIntelligence)
├── supabase/
│   ├── client.ts       browser client
│   ├── server.ts       server client (async cookies)
│   ├── middleware.ts   session refresh + route gate
│   └── admin.ts        service-role client (admin ops only)
├── sample-data.ts      seeded persona generators (balanced/tight/variable/
│                       saver/stacker/splurge)
├── categories.ts       canonical category list with bucket mapping
├── categorize.ts       rule-based categorizer
├── profile.ts          currency lookup + supported list
└── format.ts           cents↔dollars, money + date formatters

proxy.ts                Next.js 16 middleware (renamed from middleware.ts)

supabase/migrations/    SQL migrations (record-keeping; applied via dashboard)
```

## Notes

- Magic-link templates use `{{ .RedirectTo }}` (not `{{ .SiteURL }}`) so the
  same template works for both localhost and production.
- Account balance is mutated by manual transaction create/update/delete only.
- Sample data is tagged `source = 'sample'` and lives in `Sample %` accounts.
  Creating your own account auto-wipes any sample data; loading a persona is
  refused if you already have a non-sample account.
- The narrative layer never sees raw transactions — only the aggregated
  metrics, pattern summaries, and top 5 recurring charges. Privacy posture
  documented in `lib/intelligence/narrate.ts`.

## License

Personal project — not currently licensed for redistribution.
