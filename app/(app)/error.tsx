"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Error boundary for everything in the authenticated (app) segment. Renders
 * inside the (app) layout so the header nav stays visible.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Could pipe to a telemetry service later. For now, browser console only.
    // eslint-disable-next-line no-console
    console.error("(app) segment error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            We hit an unexpected error rendering this page. Try again in a
            moment — your data is safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
            <Button
              render={<Link href="/dashboard">Back to dashboard</Link>}
              variant="ghost"
            />
          </div>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
