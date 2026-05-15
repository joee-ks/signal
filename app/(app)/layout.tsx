import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./_actions";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/signals", label: "Signals" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — proxy already gates these, but never trust middleware alone.
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Signal
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[14rem] truncate text-sm text-muted-foreground sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        {/* Mobile nav row */}
        <div className="border-t sm:hidden">
          <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 py-2 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
