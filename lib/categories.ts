/**
 * Canonical list of categories used in manual entry + the categorizer fallback.
 * `bucket` is the high-level classification used by the intelligence engine
 * (Phase 3): one of 'income' | 'essential' | 'discretionary' | 'transfer' | 'debt'.
 */

export type Bucket =
  | "income"
  | "essential"
  | "discretionary"
  | "transfer"
  | "debt";

export type CategoryDef = {
  value: string;
  label: string;
  bucket: Bucket;
  /**
   * `true` for categories where the timing and amount of any individual
   * charge varies widely (groceries, dining, etc.) — used by the
   * subscription-creep detector to suppress false-positive "new recurring
   * charge" flags from random merchant repeats.
   */
  isVariable?: boolean;
};

export const CATEGORIES: readonly CategoryDef[] = [
  { value: "income",        label: "Income",         bucket: "income" },
  { value: "housing",       label: "Housing",        bucket: "essential" },
  { value: "utilities",     label: "Utilities",      bucket: "essential" },
  { value: "phone",         label: "Phone",          bucket: "essential" },
  { value: "internet",      label: "Internet",       bucket: "essential" },
  { value: "groceries",     label: "Groceries",      bucket: "essential",     isVariable: true },
  { value: "transport",     label: "Transport",      bucket: "essential",     isVariable: true },
  { value: "health",        label: "Health",         bucket: "essential" },
  { value: "insurance",     label: "Insurance",      bucket: "essential" },
  { value: "childcare",     label: "Childcare",      bucket: "essential" },
  { value: "education",     label: "Education",      bucket: "essential" },
  { value: "debt",          label: "Debt payment",   bucket: "debt" },
  { value: "dining",        label: "Dining out",     bucket: "discretionary", isVariable: true },
  { value: "coffee",        label: "Coffee",         bucket: "discretionary", isVariable: true },
  { value: "shopping",      label: "Shopping",       bucket: "discretionary", isVariable: true },
  { value: "subscriptions", label: "Subscriptions",  bucket: "discretionary" },
  { value: "entertainment", label: "Entertainment",  bucket: "discretionary" },
  { value: "fitness",       label: "Fitness",        bucket: "discretionary" },
  { value: "travel",        label: "Travel",         bucket: "discretionary", isVariable: true },
  { value: "gifts",         label: "Gifts",          bucket: "discretionary", isVariable: true },
  { value: "cash",          label: "Cash / ATM",     bucket: "discretionary", isVariable: true },
  { value: "transfer",      label: "Transfer",       bucket: "transfer" },
  { value: "uncategorized", label: "Uncategorized",  bucket: "discretionary", isVariable: true },
] as const;

export function bucketFor(category: string): Bucket {
  return CATEGORIES.find((c) => c.value === category)?.bucket ?? "discretionary";
}

export function labelFor(category: string): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/**
 * True if charges in this category vary widely in timing and amount, making
 * any "recurring" detection in it more likely to be a coincidence than a
 * real subscription / bill.
 */
export function isVariableCategory(category: string): boolean {
  return CATEGORIES.find((c) => c.value === category)?.isVariable === true;
}
