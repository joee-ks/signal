/**
 * Pre-baked narratives for each sample persona. Hand-crafted to be evergreen
 * (no specific dollar amounts, no currency symbols, no day-specific values)
 * so they stay accurate regardless of when a user loads the sample, what
 * currency they have set, or how many times they swap between personas.
 *
 * Why these exist: sample exploration would otherwise burn a Haiku token call
 * every time someone loads a persona — including persona swaps within the
 * same session. Six personas × any number of curious users would add up
 * quickly with zero educational value beyond the first user who'd already
 * seen the same generated text. With these constants, sample users get a
 * consistent narrative at zero per-request cost.
 *
 * Tone and content match what the deterministic engine would compute for
 * each persona's data shape — verified during persona calibration.
 */

import type { Narrative } from "@/lib/intelligence/narrate";
import type { PersonaId } from "@/lib/sample-data";

export const PERSONA_NARRATIVES: Record<PersonaId, Narrative> = {
  balanced: {
    tone: "watchful",
    headline: "Your spending is steady, but it's creeping in two places.",
    insights: [
      "Income and essentials are stable month over month — the foundation is solid.",
      "A handful of new subscriptions has appeared recently. None is large on its own, but together they're nibbling at the cushion.",
      "Dining out has trended noticeably above your usual baseline over the last few weeks.",
    ],
    focus:
      "Cancel any of the new subscriptions you don't actively use. One or two cuts will give back the margin without touching your lifestyle.",
  },
  tight: {
    tone: "urgent",
    headline: "Essentials are crowding everything else out.",
    insights: [
      "Roughly 85% of your income is committed to essentials before any discretionary spending begins.",
      "Your cash buffer is close to empty — one unexpected charge could push next month into the red.",
      "A new streaming subscription appeared recently. Small, but worth removing in a tight spot.",
      "If your income dropped 20% next month, your essentials wouldn't be fully covered.",
    ],
    focus:
      "Cut the newest subscription first — the easiest win. Then look at any non-essential auto-renewals before they hit again.",
  },
  variable: {
    tone: "watchful",
    headline: "Your income is irregular and your dining is climbing.",
    insights: [
      "Deposits arrive in waves rather than on a schedule, which makes month-to-month planning noisier than fixed pay would.",
      "Dining spend has trended notably above your usual baseline in recent weeks.",
      "Overall buffer is healthy — the variability is the bigger story than the totals.",
    ],
    focus:
      "Set aside a fixed percentage of every deposit the day it lands. Smoothing irregular income into a steady monthly figure is what turns this from stressful into stable.",
  },
  saver: {
    tone: "calm",
    headline: "Your numbers all line up — keep doing what you're doing.",
    insights: [
      "Income comfortably exceeds spending each month, with no anomalies in either direction.",
      "Your liquid buffer covers several months of essentials — well above the typical comfort threshold.",
      "Recurring charges and discretionary spending are both stable.",
    ],
    focus:
      "You're in the position most people are working toward. The next lever is what you do with the surplus — savings rate, investing, or paying down any remaining debt.",
  },
  stacker: {
    tone: "watchful",
    headline: "Three new subscriptions stacked on an already-loaded list.",
    insights: [
      "Three new streaming or SaaS charges have appeared in the last month, on top of an existing stack.",
      "Individually each is small, but the combined monthly cost has grown noticeably.",
      "Income and essentials are healthy — this is a discretionary creep, not a structural problem.",
    ],
    focus:
      "Audit the new charges and cancel any you can't remember the last time you used. Subscription stacks compound quietly.",
  },
  splurge: {
    tone: "urgent",
    headline: "Discretionary spending has spiked sharply in the last month.",
    insights: [
      "Dining, coffee, and shopping are all trending well above your usual baseline.",
      "Income hasn't changed — the gap is being paid out of your buffer.",
      "If the current pace holds, your runway will shrink visibly over the next few months.",
    ],
    focus:
      "Pick one category to reset first. Dining or shopping usually gives the most slack without feeling restrictive.",
  },
};
