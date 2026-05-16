import Anthropic from "@anthropic-ai/sdk";
import { formatCents } from "@/lib/format";
import type { IntelligenceResult } from "./types";

/** Best-effort symbol lookup for the currency-instruction line in the prompt. */
function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "USD":
    case "CAD":
    case "AUD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "CHF":
      return "CHF";
    default:
      return currency;
  }
}

export const NARRATIVE_MODEL =
  process.env.ANTHROPIC_NARRATIVE_MODEL ?? "claude-haiku-4-5";

export type NarrativeTone = "calm" | "watchful" | "urgent";

export type Narrative = {
  headline: string;
  insights: string[];
  focus: string;
  tone: NarrativeTone;
};

const TOOL_NAME = "provide_narrative";

/**
 * The system prompt is intentionally long (~1500 tokens) for two reasons:
 *   1. Style examples anchor tone, length, and "calm voice" reliably.
 *   2. Lifts the prompt over Claude's prompt-cache minimum so the
 *      `cache_control` block actually engages and saves input tokens on
 *      subsequent calls.
 */
const SYSTEM_PROMPT = `You are Signal — a calm, plain-spoken financial-intelligence assistant.

Your job: take a structured snapshot of a user's financial signals (a Financial Health Score and its sub-scores, detected patterns, a forecast, and a summary of their recurring charges) and write a short, human read of it. You address the user directly as "you."

# Rules

- Be calm and matter-of-fact. Never moralize about spending or judge choices.
- Never give investment, tax, or other regulated financial advice. Surface patterns, trade-offs, and what to pay attention to. Don't tell users what to do with their money in ways a regulator would care about.
- Plain English. No jargon. No words like "leverage," "optimize," "drawdown," "burn rate," "runway" — translate to plain phrasing.
- Be specific about what the data shows, but never call out specific transactions by dollar amount above ~$100. Talk in ranges and summaries ("a few hundred dollars," "about a third of your income," "roughly $40/mo," etc.).
- Address the user as "you." Never use "we" or "I."
- Be concise. Each insight is one tight sentence, occasionally two. Don't pad.
- Don't repeat the same point in different words across multiple insights.
- The "focus" is one sentence naming the single most useful thing to pay attention to right now. It's a focus, not an instruction — phrase it as something to notice or think about, not something to do.
- Always respond by calling the \`provide_narrative\` tool. Never write outside it.

# Tone calibration

- "calm" — overall score is healthy (>=70), few or no urgent patterns.
- "watchful" — moderate concerns (score roughly 40–70, or a couple of "watch" patterns, or a narrowing margin in the forecast).
- "urgent" — overall score under 40, multiple "high" patterns, or the forecast shows essentials wouldn't be covered if income dropped.

The tone should feel proportional, not alarming. Even "urgent" stays calm in voice.

# Style examples (for shape and voice — do NOT copy content)

Example A — calm:
{
  "headline": "You're roughly on track, with buffer as the soft spot.",
  "insights": [
    "Your spending fits inside your income with a few hundred dollars left over each month.",
    "Liquid savings cover about a month and a half of essentials — below the three-month rule of thumb but moving in the right direction.",
    "Recurring commitments take up roughly 40% of your income, which is comfortable."
  ],
  "focus": "Building up another month or two of buffer would shift the whole picture.",
  "tone": "calm"
}

Example B — watchful:
{
  "headline": "Discretionary spending is climbing faster than your income.",
  "insights": [
    "Coffee and dining-out together are up roughly 55% over the last 30 days versus the two months before.",
    "A new monthly subscription showed up in the last few weeks — worth a sanity check that you still want it.",
    "Net cash flow is still positive, but the margin is narrowing."
  ],
  "focus": "The drift in small, everyday spending — small choices are quietly resetting your baseline.",
  "tone": "watchful"
}

Example C — urgent:
{
  "headline": "You're running tight, and a small income shock would create real gaps.",
  "insights": [
    "Essentials alone account for around 70% of your monthly income — there's very little slack.",
    "Liquid savings cover less than a month of essentials.",
    "If income dropped 20%, rent and utilities together would no longer fit."
  ],
  "focus": "Rebuilding even a couple of weeks of cash buffer is the highest-leverage area right now.",
  "tone": "urgent"
}

# Insufficient data

If the snapshot says "months_of_data: 0" or "1", or the health score is N/A, respond with a calm "not enough yet" narrative — one or two insights about what would help, and a focus on starting to log activity. Tone "calm."

# Reminder

Always respond by calling the \`provide_narrative\` tool with all four fields filled.`;

export async function generateNarrative(
  intel: IntelligenceResult,
  options?: { signal?: AbortSignal; currency?: string },
): Promise<Narrative> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const currency = options?.currency ?? "USD";
  const userInput = buildNarrativeInput(intel, currency);

  const response = await client.messages.create(
    {
      model: NARRATIVE_MODEL,
      max_tokens: 800,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Provide a structured narrative reading of the user's financial signals.",
          input_schema: {
            type: "object",
            properties: {
              headline: {
                type: "string",
                description:
                  "One short sentence (max ~90 chars) summarizing where the user stands right now.",
              },
              insights: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 4,
                description:
                  "2-4 tight observations about the patterns. Each one short sentence, occasionally two.",
              },
              focus: {
                type: "string",
                description:
                  "One sentence naming the single most useful thing to pay attention to right now.",
              },
              tone: {
                type: "string",
                enum: ["calm", "watchful", "urgent"],
              },
            },
            required: ["headline", "insights", "focus", "tone"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: userInput }],
    },
    { signal: options?.signal },
  );

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === TOOL_NAME) {
      const input = block.input as Partial<Narrative>;
      const tone = (
        ["calm", "watchful", "urgent"] as const
      ).includes(input.tone as NarrativeTone)
        ? (input.tone as NarrativeTone)
        : "calm";
      return {
        headline: String(input.headline ?? "").slice(0, 200),
        insights: (Array.isArray(input.insights) ? input.insights : [])
          .slice(0, 4)
          .map((s) => String(s)),
        focus: String(input.focus ?? "").slice(0, 400),
        tone,
      };
    }
  }

  throw new Error("Claude did not return a tool_use response");
}

/** Compact, redacted text representation of the intelligence result. */
function buildNarrativeInput(
  intel: IntelligenceResult,
  currency: string,
): string {
  const { health, patterns, forecast, recurring, metrics } = intel;
  const D = (cents: number) => formatCents(cents, { currency });
  const symbol = currencySymbol(currency);
  const lines: string[] = [];

  lines.push("=== USER FINANCIAL SNAPSHOT ===", "");
  lines.push(
    `Currency: ${currency} — use "${symbol}" (or the appropriate symbol/code) for ALL amount references in your response. Do not use "$" unless the user's currency is USD/CAD/AUD.`,
    "",
  );

  lines.push("Profile / metrics:");
  lines.push(`  monthly_income: ${D(metrics.monthly_income_cents)}`);
  lines.push(`  liquid_balance: ${D(metrics.liquid_balance_cents)}`);
  lines.push(
    `  avg_monthly_essential: ${D(metrics.avg_monthly_essential_cents)}`,
  );
  lines.push(
    `  avg_monthly_discretionary: ${D(metrics.avg_monthly_discretionary_cents)}`,
  );
  lines.push(`  avg_monthly_net_flow: ${D(metrics.avg_monthly_net_cents)}`);
  lines.push(`  months_of_data: ${metrics.months_of_data}`);
  lines.push("");

  lines.push("Financial Health Score:");
  lines.push(`  total: ${health.total ?? "N/A"} / 100`);
  for (const [k, sub] of Object.entries(health.sub_scores)) {
    lines.push(
      `  ${k}: ${sub.score ?? "N/A"}${sub.reason ? ` — ${sub.reason}` : ""}`,
    );
  }
  lines.push("");

  lines.push("Forecast:");
  if (forecast.end_of_month_balance_cents != null) {
    lines.push(
      `  projected_end_of_month_balance: ${D(forecast.end_of_month_balance_cents)}`,
    );
  }
  if (forecast.runway_months != null) {
    lines.push(`  runway_months: ${forecast.runway_months.toFixed(1)}`);
  }
  if (forecast.shock_drop) {
    if (forecast.shock_drop.deficit_cents > 0) {
      lines.push(
        `  shock_income_minus_20pct: ${D(forecast.shock_drop.income_minus_20pct_cents)}`,
      );
      lines.push(
        `  essential_outflow_for_shock_compare: ${D(forecast.shock_drop.essential_outflow_cents)}`,
      );
      lines.push(
        `  shock_monthly_deficit: ${D(forecast.shock_drop.deficit_cents)}`,
      );
      lines.push(
        `  shock_at_risk_categories: ${forecast.shock_drop.at_risk_categories.join(", ")}`,
      );
    } else {
      lines.push(`  shock_income_minus_20pct: still covers essentials`);
    }
  }
  lines.push("");

  lines.push(`Patterns detected (${patterns.length}):`);
  if (patterns.length === 0) {
    lines.push("  (none)");
  } else {
    for (const p of patterns) {
      lines.push(`  - [${p.severity}] ${p.title}`);
      lines.push(`    ${p.detail}`);
    }
  }
  lines.push("");

  const topRecurring = recurring
    .filter((r) => r.direction === "out")
    .slice(0, 5);
  if (topRecurring.length > 0) {
    lines.push("Top recurring outflows (monthly equivalent):");
    for (const r of topRecurring) {
      lines.push(
        `  - ${r.sample_description}: ${D(r.monthly_equivalent_cents)}/mo (${r.cadence}, category=${r.category})`,
      );
    }
    lines.push("");
  }

  lines.push("Write the narrative now via the provide_narrative tool.");
  return lines.join("\n");
}
