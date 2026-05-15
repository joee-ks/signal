import type { Pattern } from "@/lib/intelligence/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SEVERITY_LABEL: Record<Pattern["severity"], string> = {
  high: "high",
  watch: "watch",
  info: "info",
};

const SEVERITY_BADGE: Record<
  Pattern["severity"],
  React.ComponentProps<typeof Badge>["variant"]
> = {
  high: "destructive",
  watch: "secondary",
  info: "outline",
};

const SEVERITY_STRIPE: Record<Pattern["severity"], string> = {
  high: "border-l-red-500",
  watch: "border-l-amber-500",
  info: "border-l-muted-foreground/40",
};

export function PatternCard({ pattern }: { pattern: Pattern }) {
  return (
    <Card className={`border-l-4 ${SEVERITY_STRIPE[pattern.severity]}`}>
      <CardContent className="space-y-1.5 py-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-medium leading-tight">
            {pattern.title}
          </h3>
          <Badge
            variant={SEVERITY_BADGE[pattern.severity]}
            className="shrink-0 text-[10px]"
          >
            {SEVERITY_LABEL[pattern.severity]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{pattern.detail}</p>
      </CardContent>
    </Card>
  );
}
