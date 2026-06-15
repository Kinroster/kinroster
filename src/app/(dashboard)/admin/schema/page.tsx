import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Schema Reference" };

export default async function SchemaPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: appUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  const isAdmin =
    appUser?.role === "admin" || appUser?.role === "compliance_admin";
  if (!isAdmin) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Schema Reference</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Database tables, relationships, and RLS functions.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Core Hierarchy</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
{`organizations
  ├── users                          (organization_id)
  ├── residents                      (organization_id)
  ├── clinicians                     (organization_id)
  ├── notes                          (organization_id)
  ├── voice_sessions                 (organization_id)
  ├── care_tasks                     (organization_id)
  ├── incident_reports               (organization_id)
  ├── family_communications          (organization_id)
  ├── weekly_summaries               (organization_id)
  ├── audit_events                   (organization_id)
  ├── disclosure_events              (organization_id)
  ├── consent_records                (organization_id)
  ├── deletion_ledger                (organization_id)
  ├── clinician_share_links          (organization_id)
  └── family_contact_confirmation_tokens (organization_id)`}
        </pre>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Relationship Diagram</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
{`organizations ──< users
             ──< residents ──< notes ──< incident_reports
             |               |       └── voice_sessions ──< voice_transcripts
             |               |       └── care_tasks (source_voice_session_id → voice_sessions)
             |               ├──< family_contacts ──< family_user_links ──< family_voice_memos
             |               ├──< weekly_summaries
             |               ├──< family_communications
             |               ├──< caregiver_assignments
             |               ├──< resident_clinicians >── clinicians ──< clinician_share_links
             |               ├──< clinician_questions (via share_link)
             |               ├──< consent records (3 tables)
             |               ├──< resident_decisional_capacity ──< _history
             |               └──< resident_conversation_threads ──< _versions
             ├──< care_tasks
             ├──< audit_events
             ├──< disclosure_events
             └──< deletion_ledger`}
        </pre>
      </section>

      <div className="space-y-8">
        <TableSection
          name="organizations"
          description="Root tenant table. Every row in the system belongs to one org."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "name", type: "text", notes: "Facility name" },
            { col: "type", type: "text", notes: "rcfe, home_care, other" },
            { col: "timezone", type: "text", notes: "IANA tz string" },
            { col: "subscription_status", type: "text", notes: "trial, active, past_due, canceled" },
            { col: "regulatory_region", type: "text", notes: "Drives PDPA / consent variants" },
            { col: "stripe_customer_id", type: "text", notes: "" },
          ]}
          note="No foreign keys — root of the hierarchy."
        />

        <TableSection
          name="users"
          description="Staff accounts. Mirrors auth.users (same UUID)."
          columns={[
            { col: "id", type: "UUID PK", notes: "= auth.uid()" },
            { col: "organization_id", type: "UUID → organizations", notes: "" },
            { col: "email", type: "text", notes: "" },
            { col: "full_name", type: "text", notes: "" },
            { col: "role", type: "text", notes: "admin, caregiver, nurse_reviewer, ops_staff, billing_staff, compliance_admin" },
            { col: "is_active", type: "boolean", notes: "" },
          ]}
        />

        <TableSection
          name="residents"
          description="People receiving care. The central clinical subject."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "organization_id", type: "UUID → organizations", notes: "" },
            { col: "first_name, last_name", type: "text", notes: "" },
            { col: "date_of_birth", type: "date", notes: "" },
            { col: "room_number", type: "text", notes: "" },
            { col: "status", type: "text", notes: "active, discharged, deceased" },
            { col: "conditions", type: "text", notes: "Free-text medical context" },
            { col: "preferences", type: "text", notes: "Care preferences" },
            { col: "care_notes_context", type: "text", notes: "Injected into AI prompts" },
            { col: "preferred_language", type: "text", notes: "" },
            { col: "cultural_taboos, dietary_restrictions", type: "text[]", notes: "" },
          ]}
        />

        <TableSection
          name="notes"
          description="Core clinical documentation unit. Created from voice sessions or directly."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "organization_id", type: "UUID → organizations", notes: "" },
            { col: "resident_id", type: "UUID → residents", notes: "" },
            { col: "author_id", type: "UUID → users", notes: "" },
            { col: "author_type", type: "text", notes: "user, clinician" },
            { col: "note_type", type: "text", notes: "shift_note, incident, observation, summary" },
            { col: "raw_input", type: "text", notes: "Original voice transcript / text" },
            { col: "structured_output", type: "text", notes: "AI-structured JSON" },
            { col: "flagged_as_incident", type: "boolean", notes: "Auto-detected" },
            { col: "sensitive_flag", type: "boolean", notes: "42 CFR Part 2" },
            { col: "shift", type: "text", notes: "morning, afternoon, night" },
          ]}
        />

        <TableSection
          name="voice_sessions"
          description="Records each AI voice call between a caregiver and the Vapi assistant."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "organization_id", type: "UUID → organizations", notes: "" },
            { col: "resident_id", type: "UUID → residents (nullable)", notes: "null for global_triage and resident_onboarding calls" },
            { col: "caregiver_id", type: "UUID → users", notes: "" },
            { col: "call_type", type: "text", notes: "caregiver_intake, global_triage, resident_onboarding, follow_up" },
            { col: "status", type: "text", notes: "initiated, active, completed, failed" },
            { col: "vapi_call_id", type: "text", notes: "External Vapi identifier" },
            { col: "note_id", type: "UUID → notes", notes: "Produced note" },
            { col: "full_transcript", type: "text", notes: "" },
          ]}
          note="Referenced by: voice_transcripts, care_tasks (source_voice_session_id)"
        />

        <TableSection
          name="care_tasks"
          description="Tasks assigned to caregivers. Can be created manually or flagged by AI from voice calls."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "organization_id", type: "UUID → organizations", notes: "" },
            { col: "resident_id", type: "UUID → residents (nullable)", notes: "" },
            { col: "assigned_to", type: "UUID → users (nullable)", notes: "" },
            { col: "created_by", type: "UUID → users", notes: "" },
            { col: "title", type: "text", notes: "" },
            { col: "due_date", type: "date", notes: "Shown on calendar" },
            { col: "priority", type: "text", notes: "low, normal, high, urgent" },
            { col: "status", type: "text", notes: "pending, in_progress, completed, cancelled" },
            { col: "source", type: "text", notes: "manual, voice_call" },
            { col: "source_voice_session_id", type: "UUID → voice_sessions (nullable)", notes: "Set when AI flags an action item" },
          ]}
          note="When a voice call ends, the AI can flag action items → new rows with source = 'voice_call'."
        />

        <TableSection
          name="incident_reports"
          description="Formal incident documentation linked to a note."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "note_id", type: "UUID → notes", notes: "Source note" },
            { col: "resident_id", type: "UUID → residents", notes: "" },
            { col: "incident_type", type: "text", notes: "" },
            { col: "severity", type: "text", notes: "low, medium, high" },
            { col: "status", type: "text", notes: "open, reviewed, closed" },
            { col: "mandatory_report_required", type: "boolean", notes: "" },
          ]}
        />

        <TableSection
          name="family_contacts"
          description="Family members or representatives tied to a resident."
          columns={[
            { col: "resident_id", type: "UUID → residents", notes: "" },
            { col: "name, relationship", type: "text", notes: "" },
            { col: "is_primary", type: "boolean", notes: "" },
            { col: "personal_representative", type: "boolean", notes: "Legal representative" },
            { col: "authorization_scope", type: "text[]", notes: "What PHI they can receive" },
          ]}
        />

        <TableSection
          name="clinicians"
          description="External healthcare providers (physicians, therapists)."
          columns={[
            { col: "id", type: "UUID PK", notes: "" },
            { col: "organization_id", type: "UUID → organizations", notes: "" },
            { col: "full_name, email, phone", type: "text", notes: "" },
            { col: "specialty", type: "text", notes: "" },
            { col: "npi", type: "text", notes: "National Provider Identifier" },
          ]}
          note="Referenced by: resident_clinicians, clinician_share_links, clinician_questions"
        />

        <TableSection
          name="clinician_share_links"
          description="Revocable magic links granting a clinician time-limited read access."
          columns={[
            { col: "resident_id, clinician_id", type: "UUID FKs", notes: "" },
            { col: "token_hash", type: "text", notes: "bcrypt hash of the token" },
            { col: "expires_at, revoked_at", type: "timestamptz", notes: "" },
            { col: "rendered_summary", type: "jsonb", notes: "Snapshot of data at share time" },
            { col: "share_scope", type: "jsonb", notes: "Which fields/sections included" },
            { col: "open_count", type: "integer", notes: "" },
          ]}
        />

        <TableSection
          name="weekly_summaries"
          description="AI-generated weekly care summaries per resident."
          columns={[
            { col: "resident_id", type: "UUID → residents", notes: "" },
            { col: "week_start, week_end", type: "date", notes: "" },
            { col: "summary_text", type: "text", notes: "" },
            { col: "key_trends, concerns", type: "text[]", notes: "" },
            { col: "status", type: "text", notes: "pending_review, approved, regenerating" },
            { col: "source_note_ids", type: "uuid[]", notes: "Notes used to generate" },
          ]}
          note="Unique constraint: (resident_id, week_start)"
        />

        <TableSection
          name="audit_events"
          description="Append-only compliance ledger for all sensitive operations."
          columns={[
            { col: "user_id", type: "UUID → users (nullable)", notes: "" },
            { col: "event_type", type: "text", notes: "e.g. note.view, share_link.create" },
            { col: "object_type", type: "text", notes: "Table name of affected row" },
            { col: "object_id", type: "UUID", notes: "PK of affected row" },
            { col: "result", type: "text", notes: "success, denied" },
            { col: "ip_address", type: "text", notes: "" },
            { col: "metadata", type: "jsonb", notes: "Extra context" },
          ]}
        />
      </div>

      <section className="mt-10 rounded-lg border bg-muted/30 p-6">
        <h2 className="mb-4 text-lg font-semibold">RLS Function Reference</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-6 font-medium">Function</th>
                <th className="pb-2 pr-6 font-medium">Returns</th>
                <th className="pb-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                {
                  fn: "get_user_org_id()",
                  ret: "UUID",
                  desc: "Current user's organization_id",
                },
                {
                  fn: "is_admin()",
                  ret: "boolean",
                  desc: "role IN ('admin', 'compliance_admin')",
                },
                {
                  fn: "is_staff()",
                  ret: "boolean",
                  desc: "role not in ('ops_staff', 'billing_staff') — all clinical roles",
                },
                {
                  fn: "has_role(p_role)",
                  ret: "boolean",
                  desc: "Exact role match",
                },
                {
                  fn: "count_hidden_sensitive_notes(p_resident_id)",
                  ret: "integer",
                  desc: "Sensitive notes the caller cannot see",
                },
              ].map((row) => (
                <tr key={row.fn}>
                  <td className="py-2 pr-6 font-mono text-xs text-primary">
                    {row.fn}
                  </td>
                  <td className="py-2 pr-6 text-muted-foreground">{row.ret}</td>
                  <td className="py-2 text-muted-foreground">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-lg border bg-muted/30 p-6">
        <h2 className="mb-3 text-lg font-semibold">Consent Tables</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-6 font-medium">Table</th>
                <th className="pb-2 pr-6 font-medium">Subject</th>
                <th className="pb-2 font-medium">Linked To</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { table: "consent_records", subject: "Staff/user consent (TOS, data use)", link: "users" },
                { table: "resident_pdpa_consents", subject: "Resident PDPA/HIPAA consent", link: "residents" },
                { table: "family_contact_pdpa_consents", subject: "Family PDPA consent", link: "family_contacts" },
                { table: "resident_recording_consents", subject: "Consent for voice recording", link: "residents" },
              ].map((row) => (
                <tr key={row.table}>
                  <td className="py-2 pr-6 font-mono text-xs">{row.table}</td>
                  <td className="py-2 pr-6 text-muted-foreground">{row.subject}</td>
                  <td className="py-2 text-muted-foreground">{row.link}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          All share the same structure: consent_text_snapshot, signed_typed_name,
          consenting_party_*, withdrawn_at.
        </p>
      </section>
    </div>
  );
}

function TableSection({
  name,
  description,
  columns,
  note,
}: {
  name: string;
  description: string;
  columns: { col: string; type: string; notes: string }[];
  note?: string;
}) {
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/40 px-4 py-3">
        <p className="font-mono text-sm font-semibold text-primary">{name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2 font-medium">Column</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {columns.map((c) => (
              <tr key={c.col}>
                <td className="px-4 py-2 font-mono text-xs">{c.col}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{c.type}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && (
        <div className="border-t bg-muted/20 px-4 py-2">
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      )}
    </div>
  );
}
