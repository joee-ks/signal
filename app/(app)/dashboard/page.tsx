import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user!.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Financial Health Score</CardTitle>
          <CardDescription>
            Coming soon — this is where your health score, top signals, and
            forecast will appear. First we&apos;ll need a few accounts and some
            transactions (Phase 2).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile ? (
            <p className="text-sm text-muted-foreground">
              Profile loaded ✓ — Row-Level Security and the new-user trigger are
              working.
            </p>
          ) : (
            <p className="text-sm text-destructive">
              No profile row found. Make sure the Phase 1 SQL migration has been
              run in the Supabase SQL editor.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
