import { addDays, format, subDays } from "date-fns";
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

type Rand = () => number;

/** Tiny seeded RNG (mulberry32) so sample data is consistent within a session. */
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
  Math.round(base * (1 + (rng() - 0.5) * 2 * pct));

const GROCERY_MERCHANTS = [
  "TRADER JOE'S",
  "WHOLE FOODS MARKET",
  "KROGER #4421",
  "SAFEWAY",
  "ALDI",
];
const DINING_MERCHANTS = [
  "CHIPOTLE",
  "SWEETGREEN",
  "MCDONALD'S",
  "PANERA BREAD",
  "DOORDASH*Tava",
  "UBER EATS - JOE'S PIZZA",
  "TST* OLIVE BISTRO",
  "TACO BELL #2210",
];
const COFFEE_MERCHANTS = [
  "STARBUCKS STORE 0044",
  "DUNKIN #34211",
  "BLUE BOTTLE COFFEE",
  "PHILZ COFFEE",
];
const SHOPPING_MERCHANTS = [
  "AMAZON.COM*MX2H89",
  "TARGET T-0192",
  "BEST BUY #482",
  "ETSY.COM",
  "NIKE.COM",
];
const TRANSPORT_MERCHANTS = [
  "UBER TRIP",
  "LYFT *RIDE",
  "SHELL OIL 575",
  "CHEVRON #221",
  "METRO TRANSIT",
];

/**
 * Generate ~3 months of realistic-looking transactions for a single account.
 * Returns a sorted-ascending list. The caller is responsible for stamping
 * user_id + account_id and inserting.
 */
export function generateSampleTransactions(
  opts: { months?: number; seed?: number } = {},
): SampleTransaction[] {
  const months = opts.months ?? 3;
  const rng = makeRng(opts.seed ?? 42);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = subDays(today, months * 30);

  const txns: SampleTransaction[] = [];

  // --- Bi-weekly paychecks (~$2,200 each, slight jitter) ---
  for (let d = new Date(start); d <= today; d = addDays(d, 14)) {
    txns.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: jitter(rng, 220000, 0.03),
      description: "DIRECT DEPOSIT PAYROLL",
      merchant: "Payroll",
      category: "income",
      bucket: "income",
      is_recurring: true,
    });
  }

  // --- Monthly rent on the 1st ---
  for (let m = 0; m <= months; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() - months + m, 1);
    if (d < start || d > today) continue;
    txns.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: -145000,
      description: "RENT PAYMENT - METRO PROPERTY MGMT",
      merchant: "Landlord",
      category: "housing",
      bucket: "essential",
      is_recurring: true,
    });
  }

  // --- Monthly recurring bills (utilities, phone, internet, insurance) ---
  const recurringBills = [
    { amount: -8500,  desc: "PG&E ELECTRIC",          merchant: "PG&E",       category: "utilities" as const, day: 5 },
    { amount: -6500,  desc: "COMCAST XFINITY INTERNET", merchant: "Comcast",  category: "internet" as const,  day: 8 },
    { amount: -5500,  desc: "T-MOBILE WIRELESS",      merchant: "T-Mobile",   category: "phone" as const,     day: 12 },
    { amount: -14200, desc: "GEICO AUTO INSURANCE",   merchant: "Geico",      category: "insurance" as const, day: 15 },
  ];
  for (let m = 0; m <= months; m++) {
    for (const bill of recurringBills) {
      const d = new Date(today.getFullYear(), today.getMonth() - months + m, bill.day);
      if (d < start || d > today) continue;
      txns.push({
        occurred_on: format(d, "yyyy-MM-dd"),
        amount_cents: jitter(rng, bill.amount, 0.05),
        description: bill.desc,
        merchant: bill.merchant,
        category: bill.category,
        bucket: "essential",
        is_recurring: true,
      });
    }
  }

  // --- Subscriptions ---
  const subs = [
    { amount: -1599, desc: "NETFLIX.COM",        merchant: "Netflix",   day: 3 },
    { amount: -1099, desc: "SPOTIFY USA",        merchant: "Spotify",   day: 14 },
    { amount: -999,  desc: "APPLE.COM/BILL",     merchant: "Apple",     day: 22 },
    { amount: -1499, desc: "DISNEY PLUS",        merchant: "Disney+",   day: 25 },
    { amount: -2999, desc: "PLANET FITNESS",     merchant: "Planet Fitness", day: 1 },
  ];
  for (let m = 0; m <= months; m++) {
    for (const sub of subs) {
      const d = new Date(today.getFullYear(), today.getMonth() - months + m, sub.day);
      if (d < start || d > today) continue;
      txns.push({
        occurred_on: format(d, "yyyy-MM-dd"),
        amount_cents: sub.amount,
        description: sub.desc,
        merchant: sub.merchant,
        category: sub.merchant === "Planet Fitness" ? "fitness" : "subscriptions",
        bucket: "discretionary",
        is_recurring: true,
      });
    }
  }

  // --- Random discretionary noise across the period ---
  type NoiseDef = {
    n: number;
    list: readonly string[];
    range: [number, number];
    category: string;
    bucket: Bucket;
  };
  const noiseDefs: NoiseDef[] = [
    { n: 28, list: GROCERY_MERCHANTS,  range: [3500, 12000],  category: "groceries", bucket: "essential" },
    { n: 22, list: DINING_MERCHANTS,   range: [1200, 4500],   category: "dining",    bucket: "discretionary" },
    { n: 30, list: COFFEE_MERCHANTS,   range: [400, 850],     category: "coffee",    bucket: "discretionary" },
    { n: 12, list: SHOPPING_MERCHANTS, range: [1500, 18000],  category: "shopping",  bucket: "discretionary" },
    { n: 18, list: TRANSPORT_MERCHANTS, range: [800, 4500],   category: "transport", bucket: "essential" },
  ];

  const dayCount =
    Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

  for (const def of noiseDefs) {
    for (let i = 0; i < def.n; i++) {
      const offset = Math.floor(rng() * (dayCount + 1));
      const d = addDays(start, offset);
      const merchant = pick(rng, def.list);
      const min = def.range[0];
      const max = def.range[1];
      const amt = Math.round(min + rng() * (max - min));
      txns.push({
        occurred_on: format(d, "yyyy-MM-dd"),
        amount_cents: -amt,
        description: merchant,
        merchant: merchant.replace(/[#*0-9 ].*$/, "").trim(),
        category: def.category,
        bucket: def.bucket,
        is_recurring: false,
      });
    }
  }

  // --- One "subscription creep" pattern: a new sub added 1 month ago ---
  const creepStart = subDays(today, 30);
  for (let d = new Date(creepStart); d <= today; d = addDays(d, 30)) {
    txns.push({
      occurred_on: format(d, "yyyy-MM-dd"),
      amount_cents: -1999,
      description: "PATREON* CREATOR",
      merchant: "Patreon",
      category: "subscriptions",
      bucket: "discretionary",
      is_recurring: true,
    });
  }

  // Sort ascending by date for a tidy DB.
  return txns.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
}
