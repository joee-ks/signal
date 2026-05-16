import { addDays, differenceInDays, format, subDays } from "date-fns";
import type { Bucket } from "@/lib/categories";

export type SampleTransaction = {
  occurred_on: string; // YYYY-MM-DD
  amount_cents: number; // signed
  description: string;
  merchant: string;
  category: string;
  bucket: Bucket;
  is_recurring: boolean;
};

// --- RNG (seeded mulberry32 for reproducibility within a session) -----------

type Rand = () => number;

function makeRng(seed: number): Rand {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rand, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

const jitter = (rng: Rand, base: number, pct: number): number =>
  pct === 0 ? base : Math.round(base * (1 + (rng() - 0.5) * 2 * pct));

const merchantClean = (s: string): string =>
  s.replace(/[#*0-9 ].*$/, "").trim();

// --- Insert helpers ---------------------------------------------------------

type RecurringConfig = {
  amount_cents: number;
  jitter_pct?: number;
  description: string;
  merchant: string;
  category: string;
  bucket: Bucket;
};

function pushBiweekly(
  out: SampleTransaction[],
  rng: Rand,
  start: Date,
  today: Date,
  cfg: RecurringConfig,
) {
  for (let d = new Date(start); d <= today; d = addDays(d, 14)) {
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: jitter(rng, cfg.amount_cents, cfg.jitter_pct ?? 0),
      description: cfg.description,
      merchant: cfg.merchant,
      category: cfg.category,
      bucket: cfg.bucket,
      is_recurring: true,
    });
  }
}

function pushMonthly(
  out: SampleTransaction[],
  rng: Rand,
  start: Date,
  today: Date,
  monthsBack: number,
  cfg: RecurringConfig & { day: number },
) {
  for (let m = 0; m <= monthsBack; m++) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth() - monthsBack + m,
      cfg.day,
    );
    if (d < start || d > today) continue;
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: jitter(rng, cfg.amount_cents, cfg.jitter_pct ?? 0),
      description: cfg.description,
      merchant: cfg.merchant,
      category: cfg.category,
      bucket: cfg.bucket,
      is_recurring: true,
    });
  }
}

function pushNoise(
  out: SampleTransaction[],
  rng: Rand,
  start: Date,
  today: Date,
  cfg: {
    count: number;
    merchants: readonly string[];
    range_cents: [number, number];
    category: string;
    bucket: Bucket;
  },
) {
  const dayCount = differenceInDays(today, start);
  for (let i = 0; i < cfg.count; i++) {
    const d = addDays(start, Math.floor(rng() * (dayCount + 1)));
    const merchant = pick(rng, cfg.merchants);
    const amt = Math.round(
      cfg.range_cents[0] + rng() * (cfg.range_cents[1] - cfg.range_cents[0]),
    );
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: -amt,
      description: merchant,
      merchant: merchantClean(merchant),
      category: cfg.category,
      bucket: cfg.bucket,
      is_recurring: false,
    });
  }
}

// --- Merchant pools ---------------------------------------------------------

const GROCERY = [
  "TRADER JOE'S",
  "WHOLE FOODS MARKET",
  "KROGER #4421",
  "SAFEWAY",
  "ALDI",
];
const CHEAP_GROCERY = [
  "WALMART NEIGHBORHOOD",
  "ALDI #45",
  "KROGER #221",
  "DOLLAR TREE",
];
const DINING = [
  "CHIPOTLE",
  "SWEETGREEN",
  "MCDONALD'S",
  "PANERA BREAD",
  "DOORDASH*Tava",
  "UBER EATS - JOE'S PIZZA",
  "TST* OLIVE BISTRO",
  "TACO BELL #2210",
];
const CHEAP_DINING = ["MCDONALD'S #14", "TACO BELL", "SUBWAY", "WENDY'S"];
const COFFEE = [
  "STARBUCKS STORE 0044",
  "DUNKIN #34211",
  "BLUE BOTTLE COFFEE",
  "PHILZ COFFEE",
];
const SHOPPING = [
  "AMAZON.COM*MX2H89",
  "TARGET T-0192",
  "BEST BUY #482",
  "ETSY.COM",
  "NIKE.COM",
];
const TRANSPORT = [
  "UBER TRIP",
  "LYFT *RIDE",
  "SHELL OIL 575",
  "CHEVRON #221",
  "METRO TRANSIT",
];

// --- Persona generators -----------------------------------------------------

function generateBalanced(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 42);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = subDays(today, 90);
  const out: SampleTransaction[] = [];

  pushBiweekly(out, rng, start, today, {
    amount_cents: 220000,
    jitter_pct: 0.03,
    description: "DIRECT DEPOSIT PAYROLL",
    merchant: "Payroll",
    category: "income",
    bucket: "income",
  });

  pushMonthly(out, rng, start, today, 3, {
    day: 1,
    amount_cents: -145000,
    description: "RENT PAYMENT - METRO PROPERTY MGMT",
    merchant: "Landlord",
    category: "housing",
    bucket: "essential",
  });

  const bills = [
    { day: 5,  a: -8500,  d: "PG&E ELECTRIC",          m: "PG&E",     c: "utilities" },
    { day: 8,  a: -6500,  d: "COMCAST XFINITY",        m: "Comcast",  c: "internet" },
    { day: 12, a: -5500,  d: "T-MOBILE WIRELESS",      m: "T-Mobile", c: "phone" },
    { day: 15, a: -14200, d: "GEICO AUTO INSURANCE",   m: "Geico",    c: "insurance" },
  ];
  for (const b of bills) {
    pushMonthly(out, rng, start, today, 3, {
      day: b.day,
      amount_cents: b.a,
      jitter_pct: 0.05,
      description: b.d,
      merchant: b.m,
      category: b.c,
      bucket: "essential",
    });
  }

  const subs = [
    { day: 3,  a: -1599, d: "NETFLIX.COM",     m: "Netflix",        c: "subscriptions" },
    { day: 14, a: -1099, d: "SPOTIFY USA",     m: "Spotify",        c: "subscriptions" },
    { day: 22, a: -999,  d: "APPLE.COM/BILL",  m: "Apple",          c: "subscriptions" },
    { day: 25, a: -1499, d: "DISNEY PLUS",     m: "Disney+",        c: "subscriptions" },
    { day: 1,  a: -2999, d: "PLANET FITNESS",  m: "Planet Fitness", c: "fitness" },
  ];
  for (const s of subs) {
    pushMonthly(out, rng, start, today, 3, {
      day: s.day,
      amount_cents: s.a,
      description: s.d,
      merchant: s.m,
      category: s.c,
      bucket: "discretionary",
    });
  }

  pushNoise(out, rng, start, today, { count: 28, merchants: GROCERY,   range_cents: [3500, 12000], category: "groceries", bucket: "essential" });
  pushNoise(out, rng, start, today, { count: 22, merchants: DINING,    range_cents: [1200, 4500],  category: "dining",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 30, merchants: COFFEE,    range_cents: [400, 850],    category: "coffee",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 12, merchants: SHOPPING,  range_cents: [1500, 18000], category: "shopping",  bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 18, merchants: TRANSPORT, range_cents: [800, 4500],   category: "transport", bucket: "essential" });

  // Planted subscription creep: a new monthly sub appears ~30 days ago.
  const creepStart = subDays(today, 30);
  for (let d = new Date(creepStart); d <= today; d = addDays(d, 30)) {
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: -1999,
      description: "PATREON* CREATOR",
      merchant: "Patreon",
      category: "subscriptions",
      bucket: "discretionary",
      is_recurring: true,
    });
  }

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

function generateTight(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 43);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = subDays(today, 90);
  const out: SampleTransaction[] = [];

  // Bi-weekly $1,250 paychecks → ~$2,500/mo. Rent at $1,500 means
  // essentials sit around 80% of income — actually tight.
  pushBiweekly(out, rng, start, today, {
    amount_cents: 125000,
    jitter_pct: 0.02,
    description: "DIRECT DEPOSIT PAYROLL",
    merchant: "Payroll",
    category: "income",
    bucket: "income",
  });

  pushMonthly(out, rng, start, today, 3, {
    day: 1,
    amount_cents: -150000,
    description: "RENT PAYMENT - SUNRISE MGMT",
    merchant: "Landlord",
    category: "housing",
    bucket: "essential",
  });

  pushMonthly(out, rng, start, today, 3, { day: 5,  amount_cents: -7500, jitter_pct: 0.05, description: "PG&E ELECTRIC",      merchant: "PG&E",    category: "utilities", bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 10, amount_cents: -5500, jitter_pct: 0.05, description: "COMCAST INTERNET",   merchant: "Comcast", category: "internet",  bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 14, amount_cents: -4500, jitter_pct: 0.05, description: "MINT MOBILE",        merchant: "Mint",    category: "phone",     bucket: "essential" });

  pushMonthly(out, rng, start, today, 3, {
    day: 20,
    amount_cents: -18500,
    description: "NELNET STUDENT LOAN",
    merchant: "Nelnet",
    category: "debt",
    bucket: "debt",
  });

  pushMonthly(out, rng, start, today, 3, {
    day: 3,
    amount_cents: -1599,
    description: "NETFLIX.COM",
    merchant: "Netflix",
    category: "subscriptions",
    bucket: "discretionary",
  });

  pushNoise(out, rng, start, today, { count: 16, merchants: CHEAP_GROCERY, range_cents: [4500, 9500],  category: "groceries", bucket: "essential" });
  pushNoise(out, rng, start, today, { count: 10, merchants: CHEAP_DINING,  range_cents: [800, 1400],   category: "dining",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 8,  merchants: ["METRO TRANSIT", "SHELL OIL 575"], range_cents: [400, 2800], category: "transport", bucket: "essential" });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

function generateVariable(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 44);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = subDays(today, 90);
  const out: SampleTransaction[] = [];

  // Irregular gig deposits — 9 deposits, wildly varying amounts. CV should
  // trip the `income_irregularity` detector (>15%).
  const depositAmounts = [
    120000, 80000, 240000, 180000, 320000, 140000, 200000, 95000, 280000,
  ];
  for (const amt of depositAmounts) {
    const offset = Math.floor(rng() * 90);
    const d = addDays(start, offset);
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: amt,
      description: pick(rng, [
        "STRIPE PAYOUT",
        "VENMO IN - CLIENT",
        "PAYPAL CLIENT PAYMENT",
        "ACH CREDIT - CLIENT",
      ]),
      merchant: "Client payment",
      category: "income",
      bucket: "income",
      is_recurring: false,
    });
  }

  pushMonthly(out, rng, start, today, 3, {
    day: 1,
    amount_cents: -130000,
    description: "RENT PAYMENT",
    merchant: "Landlord",
    category: "housing",
    bucket: "essential",
  });

  pushMonthly(out, rng, start, today, 3, { day: 6,  amount_cents: -8000, jitter_pct: 0.05, description: "CON EDISON",       merchant: "Con Edison", category: "utilities", bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 11, amount_cents: -6500, jitter_pct: 0.05, description: "SPECTRUM INTERNET", merchant: "Spectrum",   category: "internet",  bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 16, amount_cents: -5500, jitter_pct: 0.05, description: "VERIZON WIRELESS",  merchant: "Verizon",    category: "phone",     bucket: "essential" });

  pushMonthly(out, rng, start, today, 3, { day: 4,  amount_cents: -1599, description: "NETFLIX.COM",          merchant: "Netflix", category: "subscriptions", bucket: "discretionary" });
  pushMonthly(out, rng, start, today, 3, { day: 18, amount_cents: -1099, description: "SPOTIFY USA",          merchant: "Spotify", category: "subscriptions", bucket: "discretionary" });
  pushMonthly(out, rng, start, today, 3, { day: 25, amount_cents: -5400, description: "ADOBE CREATIVE CLOUD", merchant: "Adobe",   category: "subscriptions", bucket: "discretionary" });

  pushNoise(out, rng, start, today, { count: 22, merchants: GROCERY,   range_cents: [3000, 9000],  category: "groceries", bucket: "essential" });
  pushNoise(out, rng, start, today, { count: 18, merchants: DINING,    range_cents: [1200, 3800],  category: "dining",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 20, merchants: COFFEE,    range_cents: [400, 800],    category: "coffee",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 15, merchants: TRANSPORT, range_cents: [800, 4000],   category: "transport", bucket: "essential" });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

function generateSaver(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 45);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = subDays(today, 90);
  const out: SampleTransaction[] = [];

  pushBiweekly(out, rng, start, today, {
    amount_cents: 375000,
    jitter_pct: 0.02,
    description: "DIRECT DEPOSIT PAYROLL",
    merchant: "Payroll",
    category: "income",
    bucket: "income",
  });

  pushMonthly(out, rng, start, today, 3, {
    day: 1,
    amount_cents: -180000,
    description: "RENT PAYMENT",
    merchant: "Landlord",
    category: "housing",
    bucket: "essential",
  });

  pushMonthly(out, rng, start, today, 3, { day: 5,  amount_cents: -12000, jitter_pct: 0.05, description: "PG&E ELECTRIC",     merchant: "PG&E",        category: "utilities", bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 8,  amount_cents: -8000,  jitter_pct: 0.05, description: "COMCAST INTERNET",  merchant: "Comcast",     category: "internet",  bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 12, amount_cents: -6500,  jitter_pct: 0.05, description: "VERIZON",           merchant: "Verizon",     category: "phone",     bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 15, amount_cents: -15500, jitter_pct: 0.05, description: "PROGRESSIVE AUTO",  merchant: "Progressive", category: "insurance", bucket: "essential" });

  pushMonthly(out, rng, start, today, 3, { day: 3,  amount_cents: -1599, description: "NETFLIX.COM", merchant: "Netflix", category: "subscriptions", bucket: "discretionary" });
  pushMonthly(out, rng, start, today, 3, { day: 14, amount_cents: -1099, description: "SPOTIFY USA", merchant: "Spotify", category: "subscriptions", bucket: "discretionary" });

  pushNoise(out, rng, start, today, { count: 24, merchants: GROCERY,   range_cents: [4000, 11000], category: "groceries", bucket: "essential" });
  pushNoise(out, rng, start, today, { count: 12, merchants: DINING,    range_cents: [1500, 5000],  category: "dining",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 18, merchants: COFFEE,    range_cents: [400, 800],    category: "coffee",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 8,  merchants: SHOPPING,  range_cents: [2000, 12000], category: "shopping",  bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 16, merchants: TRANSPORT, range_cents: [600, 3500],   category: "transport", bucket: "essential" });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

// --- Persona registry -------------------------------------------------------

export type PersonaId = "balanced" | "tight" | "variable" | "saver";

export type Persona = {
  id: PersonaId;
  label: string;
  description: string;
  monthly_income_cents: number;
  starting_balance_cents: number;
  generate: (opts?: { seed?: number }) => SampleTransaction[];
};

export const PERSONAS: readonly Persona[] = [
  {
    id: "balanced",
    label: "Balanced",
    description:
      "Moderate income, slightly tight buffer, includes a planted subscription-creep signal.",
    monthly_income_cents: 480000,
    starting_balance_cents: 320000,
    generate: generateBalanced,
  },
  {
    id: "tight",
    label: "Tight budget",
    description:
      "Essentials eat ~80% of income; near-zero cash buffer; student-loan debt — visible stress across buffer, commitment-load, and shock sub-scores.",
    monthly_income_cents: 250000,
    starting_balance_cents: 30000,
    generate: generateTight,
  },
  {
    id: "variable",
    label: "Variable income",
    description:
      "Freelancer with irregular gig deposits — should trigger the income-variability detector.",
    monthly_income_cents: 350000,
    starting_balance_cents: 220000,
    generate: generateVariable,
  },
  {
    id: "saver",
    label: "Diligent saver",
    description:
      "Income comfortably exceeds spending; strong buffer — calm tone, high health score.",
    monthly_income_cents: 750000,
    starting_balance_cents: 1800000,
    generate: generateSaver,
  },
] as const;

export function getPersona(id: string | null | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
