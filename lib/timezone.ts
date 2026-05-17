/**
 * Signal runs in US Eastern time. This determines what "today" means for
 * the intelligence engine (month boundaries, day-of-month comparisons in the
 * anomaly detector, remaining-days math in the forecast) and for the default
 * value + max constraint on the transaction date picker.
 *
 * Stored timestamps (onboarded_at, generated_at) intentionally stay UTC —
 * those are absolute moments in time, not wall-clock dates, and Postgres
 * stores them in UTC anyway.
 */
export const APP_TIMEZONE = "America/New_York";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date as YYYY-MM-DD in US Eastern time. */
export function todayYmd(): string {
  return ymdFormatter.format(new Date());
}

/**
 * "Now" represented so that local-tz Date methods (`getFullYear`, `getMonth`,
 * `getDate`, etc.) return values for US Eastern time, regardless of the
 * server's actual runtime timezone. The intelligence engine uses local-tz
 * getters on `ctx.today`; passing this ensures month boundaries and
 * day-of-month math reflect NY's wall clock.
 *
 * Caveat: the returned Date's absolute moment (`.getTime()`) does NOT match
 * real "now" unless the runtime TZ is UTC — it's offset by the difference
 * between the runtime TZ and NY. That's fine because the engine only uses
 * it for component access and for comparison against Dates parsed the same
 * way (e.g. `new Date(occurred_on + "T00:00:00")`), which gives consistent
 * relative ordering.
 */
export function nowInAppTz(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // Intl can emit "24" for midnight in some locales
    get("minute"),
    get("second"),
  );
}

/**
 * YYYY-MM-DD arithmetic — add (or subtract, with negative `days`) a day
 * count to a date string and return the new YYYY-MM-DD. Timezone-agnostic
 * since it just shifts the date portion.
 */
export function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}
