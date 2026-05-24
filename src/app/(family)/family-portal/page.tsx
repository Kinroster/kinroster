import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Phase 4: family portal dashboard — lists the residents this family
// user is linked to via active family_user_links. Per resident, shows
// the family_safe_summary from the conversation thread (NEVER the raw
// caregiver notes, NEVER the clinician-only slice) and a link into
// the per-resident page where they can record a memo.

interface LinkRow {
  id: string;
  family_contacts: {
    id: string;
    name: string;
    relationship: string;
    residents: {
      id: string;
      first_name: string;
      last_name: string;
    } | null;
  } | null;
}

interface ThreadSlice {
  resident_id: string;
  body: { family_safe_summary?: string } | null;
  last_updated_at: string | null;
}

export default async function FamilyDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/family-portal/verify");

  // Lock the surface to role='family' — staff users hitting /family-portal
  // by mistake should land on the admin dashboard instead.
  const { data: appUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();
  if ((appUser as { role: string } | null)?.role !== "family") {
    redirect("/today");
  }

  const { data: linksData } = await supabase
    .from("family_user_links")
    .select(
      "id, family_contacts(id, name, relationship, residents(id, first_name, last_name))"
    )
    .eq("user_id", authUser.id)
    .eq("link_status", "active");

  const links = ((linksData ?? []) as unknown) as LinkRow[];

  const residentIds = links
    .map((l) => l.family_contacts?.residents?.id)
    .filter((id): id is string => Boolean(id));

  let threadByResident = new Map<string, ThreadSlice>();
  if (residentIds.length > 0) {
    const { data: threads } = await supabase
      .from("resident_conversation_threads")
      .select("resident_id, body, last_updated_at")
      .in("resident_id", residentIds);
    threadByResident = new Map(
      ((threads ?? []) as ThreadSlice[]).map((t) => [t.resident_id, t])
    );
  }

  if (links.length === 0) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">No residents linked yet</h2>
        <p className="text-sm text-muted-foreground">
          An administrator at the care facility hasn&apos;t invited you to
          view a resident&apos;s updates yet, or your invite has been
          revoked. Please contact the facility directly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Your loved ones</h2>
        <p className="text-sm text-muted-foreground">
          Tap a resident to read the latest summary and record a memo.
        </p>
      </div>

      <ul className="space-y-3">
        {links.map((link) => {
          const contact = link.family_contacts;
          const resident = contact?.residents;
          if (!contact || !resident) return null;
          const thread = threadByResident.get(resident.id);
          const summary =
            (thread?.body as { family_safe_summary?: string } | null)
              ?.family_safe_summary ?? "";

          return (
            <li
              key={link.id}
              className="rounded-xl border bg-card p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {resident.first_name} {resident.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You are listed as: {contact.relationship}
                  </p>
                </div>
                <Link href={`/family-portal/residents/${resident.id}`}>
                  <Button size="sm" variant="outline">
                    Open
                  </Button>
                </Link>
              </div>
              {summary ? (
                <p className="text-sm leading-relaxed">{summary}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A summary will appear once the care team has logged
                  observations.
                </p>
              )}
              {thread?.last_updated_at && (
                <p className="text-[10px] text-muted-foreground">
                  Updated {new Date(thread.last_updated_at).toLocaleString()}
                </p>
              )}
              <div className="pt-1 flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  AI-summarised
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Raw notes from staff are not shared.
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
