/**
 * Money formatting helpers. Internally all amounts are signed minor units (cents).
 */

export function formatCents(
  cents: number | null | undefined,
  opts?: { sign?: "always" | "negative-only"; currency?: string },
): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  const currency = opts?.currency ?? "USD";
  const value = cents / 100;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  if (opts?.sign === "always" && cents !== 0) {
    return `${cents > 0 ? "+" : "−"}${formatted}`;
  }
  if (cents < 0) return `−${formatted}`;
  return formatted;
}

/**
 * Parse a user-typed dollar amount into cents. Accepts "42", "42.5", "42.50",
 * "1,234.56", " $42.50 ", etc. Returns null on garbage.
 */
export function centsFromDollarString(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[\s,$]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
