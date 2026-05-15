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
};

export const CATEGORIES: readonly CategoryDef[] = [
  { value: "income",        label: "Income",         bucket: "income" },
  { value: "housing",       label: "Housing",        bucket: "essential" },
  { value: "utilities",     label: "Utilities",      bucket: "essential" },
  { value: "phone",         label: "Phone",          bucket: "essential" },
  { value: "internet",      label: "Internet",       bucket: "essential" },
  { value: "groceries",     label: "Groceries",      bucket: "essential" },
  { value: "transport",     label: "Transport",      bucket: "essential" },
  { value: "health",        label: "Health",         bucket: "essential" },
  { value: "insurance",     label: "Insurance",      bucket: "essential" },
  { value: "childcare",     label: "Childcare",      bucket: "essential" },
  { value: "education",     label: "Education",      bucket: "essential" },
  { value: "debt",          label: "Debt payment",   bucket: "debt" },
  { value: "dining",        label: "Dining out",     bucket: "discretionary" },
  { value: "coffee",        label: "Coffee",         bucket: "discretionary" },
  { value: "shopping",      label: "Shopping",       bucket: "discretionary" },
  { value: "subscriptions", label: "Subscriptions",  bucket: "discretionary" },
  { value: "entertainment", label: "Entertainment",  bucket: "discretionary" },
  { value: "fitness",       label: "Fitness",        bucket: "discretionary" },
  { value: "travel",        label: "Travel",         bucket: "discretionary" },
  { value: "gifts",         label: "Gifts",          bucket: "discretionary" },
  { value: "cash",          label: "Cash / ATM",     bucket: "discretionary" },
  { value: "transfer",      label: "Transfer",       bucket: "transfer" },
  { value: "uncategorized", label: "Uncategorized",  bucket: "discretionary" },
] as const;

export function bucketFor(category: string): Bucket {
  return CATEGORIES.find((c) => c.value === category)?.bucket ?? "discretionary";
}

export function labelFor(category: string): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
