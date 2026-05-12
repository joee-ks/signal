import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
        <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          Financial health &amp; intelligence
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Find the signal in your spending.
        </h1>
        <p className="text-lg text-muted-foreground text-balance">
          Signal filters financial noise into meaningful signals that guide
          better decisions. Not a budgeter, not a tracker, not an advisor —
          intelligence about your money.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button render={<Link href="/login">Get started</Link>} size="lg" />
          <Button
            render={<Link href="/login">Sign in</Link>}
            size="lg"
            variant="outline"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Signal provides information, not financial advice.
        </p>
      </div>
    </main>
  );
}
