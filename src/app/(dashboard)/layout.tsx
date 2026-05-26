import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { TrialBanner } from "@/components/trial-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  // Fetch the app user profile with organization
  const { data: user } = await supabase
    .from("users")
    .select("*, organizations(*)")
    .eq("id", authUser.id)
    .single();

  if (!user) {
    // User exists in auth but not in users table yet — may happen during signup flow
    redirect("/login");
  }

  const org = (user as { organizations: { subscription_status: string; trial_ends_at: string | null } }).organizations;
  const typedUser = user as { id: string; organization_id: string; role: string };

  // Pending family-memo count for the admin nav badge. Cheap query —
  // RLS already restricts to the caller's org via is_admin/is_staff
  // policies. We only fetch for admins to avoid wasted work.
  let pendingFamilyMemoCount = 0;
  if (typedUser.role === "admin" || typedUser.role === "compliance_admin") {
    const { count } = await supabase
      .from("family_voice_memos")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", typedUser.organization_id)
      .eq("moderation_status", "pending");
    pendingFamilyMemoCount = count ?? 0;
  }

  return (
    <>
      <TrialBanner
        subscriptionStatus={org.subscription_status}
        trialEndsAt={org.trial_ends_at}
      />
      <AppShell user={user} pendingFamilyMemoCount={pendingFamilyMemoCount}>
        {children}
      </AppShell>
    </>
  );
}
