import { createClient } from "@/lib/supabase/server";

// Phase 4: family portal layout — minimal shell distinct from the
// caregiver/admin AppShell. Auth enforcement lives in the individual
// pages (the dashboard + per-resident page redirect to
// /family-portal/verify; /family-portal/verify itself must be
// reachable unauthenticated). The layout just shows the chrome.
//
// Routed under /family-portal/* (not /family/*) because the admin
// "Family communications" tab at /family already owns that URL.

export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  let displayName: string | null = null;
  if (authUser) {
    const { data: appUser } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", authUser.id)
      .single();
    displayName =
      (appUser as { full_name: string | null } | null)?.full_name ?? null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Kinroster · Family</h1>
          {displayName && (
            <span className="text-xs text-muted-foreground">
              {displayName}
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
