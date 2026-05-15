import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native <select> with shadcn/Tailwind styling that matches our Input.
 * Server-component friendly (no hooks, no client-only deps) — we picked this
 * over the shadcn/base-ui Select to keep forms simple and server-rendered.
 */
export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
