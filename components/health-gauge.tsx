import { cn } from "@/lib/utils";

type Props = {
  score: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: { px: 96, stroke: 8, valueText: "text-xl" },
  md: { px: 160, stroke: 12, valueText: "text-3xl" },
  lg: { px: 200, stroke: 14, valueText: "text-5xl" },
} as const;

/**
 * Circular SVG gauge. Color steps:
 *   >= 75  emerald
 *   >= 50  amber
 *   >= 25  orange
 *   <  25  red
 * `score` may be null when there isn't enough data — shows "N/A".
 */
export function HealthGauge({ score, size = "md", className }: Props) {
  const { px, stroke, valueText } = SIZES[size];
  const radius = px / 2 - stroke;
  const circumference = 2 * Math.PI * radius;
  const safeScore = score ?? 0;
  const offset = circumference * (1 - safeScore / 100);

  const colorClass =
    score == null
      ? "text-muted-foreground"
      : safeScore >= 75
        ? "text-emerald-500"
        : safeScore >= 50
          ? "text-amber-500"
          : safeScore >= 25
            ? "text-orange-500"
            : "text-red-500";

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        className,
      )}
      style={{ width: px, height: px }}
    >
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        aria-hidden="true"
      >
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted"
        />
        {score != null && (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn(colorClass, "transition-[stroke-dashoffset]")}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
            }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score == null ? (
          <span className="text-sm text-muted-foreground">N/A</span>
        ) : (
          <>
            <span className={cn("font-semibold tabular-nums", valueText)}>
              {score}
            </span>
            <span className="text-xs text-muted-foreground">of 100</span>
          </>
        )}
      </div>
    </div>
  );
}
