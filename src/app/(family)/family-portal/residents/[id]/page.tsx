import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { VoiceMemoRecorder } from "@/components/family/voice-memo-recorder";
import { LocalDate } from "@/components/ui/local-date";

// Phase 4: per-resident family page.
//
// Shows:
//   - The family_safe_summary slice from the thread (NEVER raw notes).
//   - Recent open_questions tagged by author_type — these are the
//     questions surfaced TO the family from caregivers / clinicians.
//   - The voice memo recorder (gated on family_about_resident consent).
//   - The family's own recent memos with moderation status.

interface LinkRow {
  id: string;
  family_contacts: {
    id: string;
    name: string;
    relationship: string;
    resident_id: string;
    residents: {
      id: string;
      first_name: string;
      last_name: string;
      organization_id: string;
    } | null;
  } | null;
}

interface ThreadBody {
  family_safe_summary?: string;
  open_questions?: Array<{
    question: string;
    asked_by_author_type: string;
    asked_at: string;
    status: string;
  }>;
}

interface MemoRow {
  id: string;
  moderation_status: string;
  moderation_reason: string | null;
  created_at: string;
  duration_seconds: number | null;
}

export default async function FamilyResidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: residentId } = await params;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/family-portal/verify");

  // Verify the family user is linked to this resident.
  const { data: linkRow } = await supabase
    .from("family_user_links")
    .select(
      "id, family_contacts(id, name, relationship, resident_id, residents(id, first_name, last_name, organization_id))"
    )
    .eq("user_id", authUser.id)
    .eq("link_status", "active");
  const link = (((linkRow ?? []) as unknown) as LinkRow[]).find(
    (l) => l.family_contacts?.residents?.id === residentId
  );
  if (!link || !link.family_contacts || !link.family_contacts.residents) {
    notFound();
  }
  const resident = link.family_contacts.residents;

  // Thread family-safe slice.
  const { data: threadRow } = await supabase
    .from("resident_conversation_threads")
    .select("body, last_updated_at")
    .eq("resident_id", residentId)
    .maybeSingle();
  const body = (threadRow as { body: ThreadBody | null } | null)?.body ?? null;
  const lastUpdatedAt =
    (threadRow as { last_updated_at: string | null } | null)?.last_updated_at ??
    null;

  // Check recording consent for the family_about_resident class.
  const { data: consentRow } = await supabase
    .from("resident_recording_consents")
    .select("id")
    .eq("resident_id", residentId)
    .eq("consent_class", "family_about_resident")
    .is("withdrawn_at", null)
    .limit(1);
  const consentCaptured =
    consentRow !== null && (consentRow as Array<unknown>).length > 0;

  // Recent memos from this user for this resident.
  const { data: memosData } = await supabase
    .from("family_voice_memos")
    .select(
      "id, moderation_status, moderation_reason, created_at, duration_seconds"
    )
    .eq("uploaded_by_user_id", authUser.id)
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false })
    .limit(10);
  const memos = (memosData ?? []) as MemoRow[];

  return (
    <div className="space-y-5">
      <Link
        href="/family-portal"
        className="text-xs text-muted-foreground inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to all residents
      </Link>

      <header className="space-y-1">
        <h2 className="text-xl font-semibold">
          {resident.first_name} {resident.last_name}
        </h2>
        <p className="text-xs text-muted-foreground">
          You are listed as: {link.family_contacts.relationship}
        </p>
      </header>

      <section className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Summary from the care team</h3>
          <Badge variant="outline" className="text-xs">
            AI-summarised
          </Badge>
        </div>
        {body?.family_safe_summary ? (
          <p className="text-sm leading-relaxed">
            {body.family_safe_summary}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            A summary will appear once the care team has logged enough
            observations.
          </p>
        )}
        {lastUpdatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Last updated <LocalDate value={lastUpdatedAt} />
          </p>
        )}
      </section>

      {body?.open_questions && body.open_questions.length > 0 && (
        <section className="rounded-md border p-3 space-y-2">
          <h3 className="font-medium text-sm">
            Open questions from the care team
          </h3>
          <ul className="space-y-1.5">
            {body.open_questions
              .filter((q) => q.status === "pending")
              .map((q, idx) => (
                <li key={idx} className="text-sm">
                  {q.question}{" "}
                  <span className="text-xs text-muted-foreground">
                    · asked {q.asked_at} by {q.asked_by_author_type}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <VoiceMemoRecorder
        residentId={residentId}
        familyUserLinkId={link.id}
        consentCaptured={consentCaptured}
      />

      {memos.length > 0 && (
        <section className="rounded-md border p-3 space-y-2">
          <h3 className="font-medium text-sm">Your recent memos</h3>
          <ul className="space-y-1.5 text-xs">
            {memos.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-muted-foreground">
                  <LocalDate value={m.created_at} />
                  {m.duration_seconds ? ` · ${m.duration_seconds}s` : ""}
                </span>
                <Badge
                  variant="outline"
                  className={
                    m.moderation_status === "approved"
                      ? "text-green-700 border-green-500/50"
                      : m.moderation_status === "rejected"
                      ? "text-destructive border-destructive/50"
                      : "text-amber-700 border-amber-500/50"
                  }
                >
                  {m.moderation_status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="text-center">
        <Link href="/family-portal">
          <Button variant="ghost" size="sm">
            Back
          </Button>
        </Link>
      </div>
    </div>
  );
}
