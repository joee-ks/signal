import { recomputeNarrative } from "@/app/(app)/dashboard/_actions";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import type { Narrative, NarrativeTone } from "@/lib/intelligence/narrate";

const TONE_STRIPE: Record<NarrativeTone, string> = {
  calm: "border-l-emerald-500",
  watchful: "border-l-amber-500",
  urgent: "border-l-red-500",
};

const TONE_LABEL: Record<NarrativeTone, string> = {
  calm: "Calm",
  watchful: "Watchful",
  urgent: "Urgent",
};

const TONE_LABEL_CLASS: Record<NarrativeTone, string> = {
  calm: "text-emerald-600 dark:text-emerald-400",
  watchful: "text-amber-600 dark:text-amber-400",
  urgent: "text-red-600 dark:text-red-400",
};

export function NarrativeCard({
  narrative,
  generatedAt,
  fromCache,
}: {
  narrative: Narrative;
  generatedAt: string;
  fromCache: boolean;
}) {
  return (
    <Card className={`border-l-4 ${TONE_STRIPE[narrative.tone]}`}>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-medium leading-snug">
            {narrative.headline}
          </h2>
          <span
            className={`shrink-0 text-[10px] uppercase tracking-widest ${TONE_LABEL_CLASS[narrative.tone]}`}
          >
            {TONE_LABEL[narrative.tone]}
          </span>
        </div>

        <ul className="space-y-1.5">
          {narrative.insights.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span className="text-foreground">{s}</span>
            </li>
          ))}
        </ul>

        <div className="border-t pt-3">
          <p className="text-sm">
            <span className="font-medium text-muted-foreground">
              Focus →{" "}
            </span>
            <span>{narrative.focus}</span>
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Updated {ageLabel(new Date(generatedAt))}
            {fromCache ? " · cached" : ""}
          </span>
          <form action={recomputeNarrative}>
            <SubmitButton
              variant="ghost"
              size="xs"
              pendingLabel="Generating…"
            >
              Recompute
            </SubmitButton>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export function NarrativeSkeleton() {
  return (
    <Card className="border-l-4 border-l-muted">
      <CardContent className="space-y-4 py-5">
        <div className="space-y-2">
          <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
        <div className="border-t pt-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
        <p className="text-xs text-muted-foreground">
          Reading your signals…
        </p>
      </CardContent>
    </Card>
  );
}

export function NarrativeErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-l-4 border-l-muted-foreground/30">
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="text-sm font-medium">Narrative unavailable</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your signals below are still accurate. The narrative layer
            couldn&apos;t reach Claude — {message}.
          </p>
        </div>
        <form action={recomputeNarrative}>
          <SubmitButton variant="outline" size="xs">
            Try again
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function ageLabel(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
