"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = Omit<ComponentProps<typeof Button>, "type" | "disabled"> & {
  pendingLabel?: ReactNode;
  children: ReactNode;
};

/**
 * A submit button that auto-disables while its parent <form> is submitting.
 * Use inside any form that posts to a server action to prevent double-submits.
 * Hooks into Next.js / React's <form> pending state via `useFormStatus`.
 */
export function SubmitButton({ pendingLabel, children, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...rest}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
