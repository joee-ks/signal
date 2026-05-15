import { bucketFor, type Bucket } from "@/lib/categories";

export type CategoryRuleRow = {
  user_id: string | null;
  match: string;
  category: string;
  bucket: Bucket | string;
  priority: number;
};

export type CategorizeResult = {
  category: string;
  bucket: Bucket;
  matched: boolean;
};

/**
 * Given a transaction description and a set of category rules (global + user's),
 * return the best-matching category + bucket. Lowest priority wins; user rules
 * win on ties with global rules.
 */
export function categorize(
  description: string,
  rules: CategoryRuleRow[],
): CategorizeResult {
  const haystack = (description ?? "").toLowerCase();
  if (!haystack) {
    return { category: "uncategorized", bucket: "discretionary", matched: false };
  }

  // Sort: lower priority first; user rules before global on ties.
  const sorted = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aIsUser = a.user_id != null ? 0 : 1;
    const bIsUser = b.user_id != null ? 0 : 1;
    return aIsUser - bIsUser;
  });

  for (const rule of sorted) {
    const needle = rule.match.toLowerCase();
    if (needle && haystack.includes(needle)) {
      const category = rule.category;
      const bucket =
        (rule.bucket as Bucket) ?? bucketFor(category) ?? "discretionary";
      return { category, bucket: bucket as Bucket, matched: true };
    }
  }

  return { category: "uncategorized", bucket: "discretionary", matched: false };
}
