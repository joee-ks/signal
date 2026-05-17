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
├── privacy/            public privacy policy
├── terms/              public terms of use
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
├── persona-narratives.ts  pre-baked narratives for sample personas
├── categories.ts       canonical category list with bucket mapping
├── categorize.ts       rule-based categorizer
├── profile.ts          currency lookup + supported list
├── timezone.ts         US Eastern time helpers
└── format.ts           cents↔dollars, money + date formatters

proxy.ts                Next.js 16 middleware (renamed from middleware.ts)

supabase/migrations/    SQL migrations (record-keeping; applied via dashboard)
```

## License

Personal project — not currently licensed for redistribution.
