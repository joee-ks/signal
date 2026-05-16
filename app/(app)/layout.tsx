import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./_actions";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/nav-link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/signals", label: "Signals" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings", label: "Settings" },
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
      {/* Skip link — visible only when focused; lets keyboard users jump past the nav. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
      >
        Skip to main content
      </a>

      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Signal
            </Link>
            <nav
              aria-label="Primary"
              className="hidden items-center gap-1 text-sm sm:flex"
            >
              {NAV.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
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
          <nav
            aria-label="Primary mobile"
            className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-4 py-2 text-sm"
          >
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-5xl flex-1 px-4 py-8"
      >
        {children}
      </main>
    </div>
  );
}
