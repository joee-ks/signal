import { addDays, differenceInDays, format, subDays } from "date-fns";
import type { Bucket } from "@/lib/categories";
import { nowInAppTz } from "@/lib/timezone";

/**
 * Start of the sample data window: the 1st of the month, 3 calendar months
 * back from today. Always gives 3 fully-complete prior months + the current
 * partial month — exactly the shape the intelligence engine needs to compute
 * meaningful baselines without being dragged down by a partial first month.
 */
function periodStart(today: Date): Date {
  return new Date(today.getFullYear(), today.getMonth() - 3, 1);
}

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
  const today = nowInAppTz();
  today.setHours(0, 0, 0, 0);
  const start = periodStart(today);
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

  // Planted signals:
  //  - Patreon Creator started ~30 days ago, $19.99/mo → subscription_creep (info)
  //  - Notion AI Premium started 30 days ago, $25/mo → subscription_creep (watch, >$20)
  //  - Extra dining transactions in the last 30 days → lifestyle_inflation (watch)
  const patreonStart = subDays(today, 30);
  for (let d = new Date(patreonStart); d <= today; d = addDays(d, 30)) {
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
  const notionStart = subDays(today, 30);
  for (let d = new Date(notionStart); d <= today; d = addDays(d, 30)) {
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: -2500,
      description: "NOTION AI PREMIUM",
      merchant: "Notion",
      category: "subscriptions",
      bucket: "discretionary",
      is_recurring: true,
    });
  }
  pushNoise(out, rng, subDays(today, 30), today, {
    count: 7,
    merchants: DINING,
    range_cents: [2200, 3800],
    category: "dining",
    bucket: "discretionary",
  });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

function generateTight(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 43);
  const today = nowInAppTz();
  today.setHours(0, 0, 0, 0);
  const start = periodStart(today);
  const out: SampleTransaction[] = [];

  // Bi-weekly $1,250 paychecks → ~$2,500/mo. Rent at $1,600 puts essentials
  // around 85% of income — visible shortfall on the shock-resilience forecast.
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
    amount_cents: -160000,
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

  // Small recent streaming sub — represents a tight-budget user who recently
  // added Hulu they probably can't really afford. Fires subscription_creep (info).
  const huluStart = subDays(today, 30);
  for (let d = new Date(huluStart); d <= today; d = addDays(d, 30)) {
    out.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: -799,
      description: "HULU",
      merchant: "Hulu",
      category: "subscriptions",
      bucket: "discretionary",
      is_recurring: true,
    });
  }

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

function generateVariable(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 44);
  const today = nowInAppTz();
  today.setHours(0, 0, 0, 0);
  const start = periodStart(today);
  const out: SampleTransaction[] = [];

  // Irregular gig deposits — 9 deposits, wildly varying amounts. CV should
  // trip the `income_irregularity` detector (>15%).
  const depositAmounts = [
    120000, 80000, 240000, 180000, 320000, 140000, 200000, 95000, 280000,
  ];
  const dayCount = differenceInDays(today, start);
  for (const amt of depositAmounts) {
    const offset = Math.floor(rng() * (dayCount + 1));
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

  // Occasional dining splurge after a big client check came in — triggers
  // lifestyle_inflation in dining at watch severity.
  pushNoise(out, rng, subDays(today, 30), today, {
    count: 6,
    merchants: DINING,
    range_cents: [2000, 4000],
    category: "dining",
    bucket: "discretionary",
  });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

function generateSaver(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 45);
  const today = nowInAppTz();
  today.setHours(0, 0, 0, 0);
  const start = periodStart(today);
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

// ----------------------------------------------------------------------------
// "Subscription stacker" — solid income but three new subscriptions added
// in the last 35 days on top of an already-loaded streaming stack. Designed
// to trigger multiple subscription_creep signals at info + watch severities.
// ----------------------------------------------------------------------------

function generateStacker(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 46);
  const today = nowInAppTz();
  today.setHours(0, 0, 0, 0);
  const start = periodStart(today);
  const out: SampleTransaction[] = [];

  pushBiweekly(out, rng, start, today, {
    amount_cents: 225000,
    jitter_pct: 0.02,
    description: "DIRECT DEPOSIT PAYROLL",
    merchant: "Payroll",
    category: "income",
    bucket: "income",
  });

  pushMonthly(out, rng, start, today, 3, {
    day: 1,
    amount_cents: -140000,
    description: "RENT PAYMENT",
    merchant: "Landlord",
    category: "housing",
    bucket: "essential",
  });

  pushMonthly(out, rng, start, today, 3, { day: 5,  amount_cents: -8000,  jitter_pct: 0.05, description: "PG&E ELECTRIC",     merchant: "PG&E",     category: "utilities", bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 9,  amount_cents: -6500,  jitter_pct: 0.05, description: "COMCAST INTERNET",  merchant: "Comcast",  category: "internet",  bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 13, amount_cents: -5000,  jitter_pct: 0.05, description: "T-MOBILE WIRELESS", merchant: "T-Mobile", category: "phone",     bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 17, amount_cents: -13000, jitter_pct: 0.05, description: "GEICO INSURANCE",   merchant: "Geico",    category: "insurance", bucket: "essential" });

  // Long-standing subscription stack (across all months).
  const longSubs = [
    { day: 2,  amt: -1599, desc: "NETFLIX.COM",      m: "Netflix",        c: "subscriptions" },
    { day: 4,  amt: -1099, desc: "SPOTIFY USA",      m: "Spotify",        c: "subscriptions" },
    { day: 8,  amt: -999,  desc: "APPLE.COM/BILL",   m: "Apple",          c: "subscriptions" },
    { day: 11, amt: -1499, desc: "DISNEY PLUS",      m: "Disney+",        c: "subscriptions" },
    { day: 14, amt: -1599, desc: "YOUTUBE PREMIUM",  m: "YouTube",        c: "subscriptions" },
    { day: 16, amt: -1499, desc: "AUDIBLE",          m: "Audible",        c: "subscriptions" },
    { day: 18, amt: -1799, desc: "NYT SUBSCRIPTION", m: "NYT",            c: "subscriptions" },
    { day: 20, amt: -1099, desc: "ICLOUD STORAGE",   m: "iCloud",         c: "subscriptions" },
    { day: 22, amt: -899,  desc: "NOTION",           m: "Notion",         c: "subscriptions" },
    { day: 24, amt: -2499, desc: "PLANET FITNESS",   m: "Planet Fitness", c: "fitness" },
  ];
  for (const s of longSubs) {
    pushMonthly(out, rng, start, today, 3, {
      day: s.day,
      amount_cents: s.amt,
      description: s.desc,
      merchant: s.m,
      category: s.c,
      bucket: "discretionary",
    });
  }

  // Recently added subscriptions (within last ~35 days) — these are the
  // subscription_creep targets. Each needs 2+ occurrences to be detected
  // as recurring, so we schedule one ~30 days ago and one ~today.
  const newSubs = [
    { firstSeenDaysAgo: 30, amt: -1599, desc: "HBO MAX",              m: "HBO Max",  c: "subscriptions" }, // info (<$20)
    { firstSeenDaysAgo: 32, amt: -2000, desc: "OPENAI*CHATGPT PLUS",  m: "OpenAI",   c: "subscriptions" }, // info (=$20, boundary)
    { firstSeenDaysAgo: 30, amt: -5499, desc: "ADOBE CREATIVE CLOUD", m: "Adobe",    c: "subscriptions" }, // watch (>$20)
  ];
  for (const s of newSubs) {
    const firstDate = subDays(today, s.firstSeenDaysAgo);
    for (let d = new Date(firstDate); d <= today; d = addDays(d, 30)) {
      out.push({
        occurred_on: format(d, "yyyy-MM-dd"),
        amount_cents: s.amt,
        description: s.desc,
        merchant: s.m,
        category: s.c,
        bucket: "discretionary",
        is_recurring: true,
      });
    }
  }

  // Modest variable spending.
  pushNoise(out, rng, start, today, { count: 22, merchants: GROCERY,   range_cents: [3500, 11000], category: "groceries", bucket: "essential" });
  pushNoise(out, rng, start, today, { count: 16, merchants: DINING,    range_cents: [1500, 4000],  category: "dining",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 22, merchants: COFFEE,    range_cents: [400, 800],    category: "coffee",    bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 8,  merchants: SHOPPING,  range_cents: [1500, 8000],  category: "shopping",  bucket: "discretionary" });
  pushNoise(out, rng, start, today, { count: 14, merchants: TRANSPORT, range_cents: [800, 4000],   category: "transport", bucket: "essential" });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

// ----------------------------------------------------------------------------
// "Lifestyle splurge" — solid income but discretionary spending sharply
// elevated in the last 30 days across dining, coffee, and shopping. Designed
// to trigger lifestyle_inflation signals at high severity in multiple
// categories (and likely a few anomaly signals too).
// ----------------------------------------------------------------------------

function generateSplurge(opts: { seed?: number } = {}): SampleTransaction[] {
  const rng = makeRng(opts.seed ?? 47);
  const today = nowInAppTz();
  today.setHours(0, 0, 0, 0);
  const start = periodStart(today);
  const out: SampleTransaction[] = [];

  pushBiweekly(out, rng, start, today, {
    amount_cents: 275000,
    jitter_pct: 0.02,
    description: "DIRECT DEPOSIT PAYROLL",
    merchant: "Payroll",
    category: "income",
    bucket: "income",
  });

  pushMonthly(out, rng, start, today, 3, {
    day: 1,
    amount_cents: -150000,
    description: "RENT PAYMENT",
    merchant: "Landlord",
    category: "housing",
    bucket: "essential",
  });

  pushMonthly(out, rng, start, today, 3, { day: 5,  amount_cents: -10000, jitter_pct: 0.05, description: "PG&E ELECTRIC",    merchant: "PG&E",    category: "utilities", bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 10, amount_cents: -8000,  jitter_pct: 0.05, description: "COMCAST INTERNET", merchant: "Comcast", category: "internet",  bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 14, amount_cents: -6500,  jitter_pct: 0.05, description: "VERIZON",          merchant: "Verizon", category: "phone",     bucket: "essential" });
  pushMonthly(out, rng, start, today, 3, { day: 17, amount_cents: -15000, jitter_pct: 0.05, description: "GEICO INSURANCE",  merchant: "Geico",   category: "insurance", bucket: "essential" });

  pushMonthly(out, rng, start, today, 3, { day: 3,  amount_cents: -1599, description: "NETFLIX.COM", merchant: "Netflix", category: "subscriptions", bucket: "discretionary" });
  pushMonthly(out, rng, start, today, 3, { day: 14, amount_cents: -1099, description: "SPOTIFY USA", merchant: "Spotify", category: "subscriptions", bucket: "discretionary" });

  // Steady essentials.
  pushNoise(out, rng, start, today, { count: 24, merchants: GROCERY,   range_cents: [4000, 11000], category: "groceries", bucket: "essential" });
  pushNoise(out, rng, start, today, { count: 14, merchants: TRANSPORT, range_cents: [800, 3500],   category: "transport", bucket: "essential" });

  // Discretionary: a modest baseline over the older 75 days, then a sharp
  // spike concentrated in the last 30 days. Lifestyle inflation should
  // trigger high severity in all three categories.
  const spikeStart = subDays(today, 30);

  // Dining: prior baseline ~$80/mo, recent ~$720/mo.
  pushNoise(out, rng, start, spikeStart, { count: 8,  merchants: DINING, range_cents: [1500, 3500], category: "dining", bucket: "discretionary" });
  pushNoise(out, rng, spikeStart, today, { count: 16, merchants: DINING, range_cents: [2500, 6500], category: "dining", bucket: "discretionary" });

  // Coffee: prior baseline ~$24/mo, recent ~$120/mo.
  pushNoise(out, rng, start, spikeStart, { count: 10, merchants: COFFEE, range_cents: [400, 800], category: "coffee", bucket: "discretionary" });
  pushNoise(out, rng, spikeStart, today, { count: 18, merchants: COFFEE, range_cents: [500, 900], category: "coffee", bucket: "discretionary" });

  // Shopping: prior baseline ~$80/mo, recent ~$800/mo.
  pushNoise(out, rng, start, spikeStart, { count: 4, merchants: SHOPPING, range_cents: [2000, 8000],  category: "shopping", bucket: "discretionary" });
  pushNoise(out, rng, spikeStart, today, { count: 8, merchants: SHOPPING, range_cents: [3000, 18000], category: "shopping", bucket: "discretionary" });

  return out.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}

// --- Persona registry -------------------------------------------------------

export type PersonaId =
  | "balanced"
  | "tight"
  | "variable"
  | "saver"
  | "stacker"
  | "splurge";

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
      "Moderate income, slightly tight buffer; planted subscription creeps and a watch-level dining inflation.",
    monthly_income_cents: 480000,
    starting_balance_cents: 320000,
    generate: generateBalanced,
  },
  {
    id: "tight",
    label: "Tight budget",
    description:
      "Essentials eat ~85% of income; near-zero cash buffer; student-loan debt; underwater on shock-resilience; plus a recent streaming sub that fires a creep signal.",
    monthly_income_cents: 250000,
    starting_balance_cents: 30000,
    generate: generateTight,
  },
  {
    id: "variable",
    label: "Variable income",
    description:
      "Freelancer with irregular gig deposits plus an occasional dining splurge — triggers income-variability and lifestyle-inflation signals.",
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
  {
    id: "stacker",
    label: "Subscription stacker",
    description:
      "Healthy income, already-loaded streaming stack, plus three new subscriptions added in the last 35 days — showcases multiple subscription creep signals.",
    monthly_income_cents: 450000,
    starting_balance_cents: 200000,
    generate: generateStacker,
  },
  {
    id: "splurge",
    label: "Lifestyle splurge",
    description:
      "Healthy income with discretionary spending sharply elevated in the last 30 days — showcases lifestyle inflation signals at high severity.",
    monthly_income_cents: 550000,
    starting_balance_cents: 400000,
    generate: generateSplurge,
  },
] as const;

export function getPersona(id: string | null | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
