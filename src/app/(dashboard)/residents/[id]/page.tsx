import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pencil, Mail, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { NoteTimeline } from "@/components/notes/note-timeline";
import { NotesInfiniteList } from "@/components/notes/notes-infinite-list";
import { NoteFilters } from "@/components/notes/note-filters";
import { NoteInputForm } from "@/components/notes/note-input-form";
import {
  applyNotesFilters,
  parseNotesFiltersFromSearchParams,
} from "@/lib/notes-query";
import { VoiceCallButton } from "@/components/notes/voice-call-button";
import { FamilyContactList } from "@/components/residents/family-contact-list";
import {
  ResidentClinicianList,
  type AssignedClinician,
  type DirectoryClinician,
} from "@/components/clinicians/resident-clinician-list";
import { ResidentDeleteControls } from "@/components/data-requests/resident-delete-controls";
import { ExportReportButton } from "@/components/residents/export-report-dialog";
import { QuickSummaryButton } from "@/components/residents/quick-summary-button";
import type { Resident, FamilyContact } from "@/types/database";

export default async function ResidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  const filters = parseNotesFiltersFromSearchParams(rawSearchParams);
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const { data: residentData } = await supabase
    .from("residents")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();

  const resident = residentData as Resident | null;
  if (!resident) notFound();

  const INITIAL_PAGE_SIZE = 50;
  let notesQuery = supabase
    .from("notes")
    .select(
      `
      *,
      residents (first_name, last_name),
      users:author_id (full_name)
    `
    )
    .eq("resident_id", id)
    .order("created_at", { ascending: false })
    .limit(INITIAL_PAGE_SIZE);

  notesQuery = applyNotesFilters(notesQuery, filters);

  const { data: notes } = await notesQuery;

  const initialNotes = (notes ?? []) as Parameters<
    typeof NoteTimeline
  >[0]["notes"];
  const hasMoreNotes = initialNotes.length === INITIAL_PAGE_SIZE;

  // Phase 4: count sensitive notes the caller can't see (admins and authors
  // see them directly; everyone else gets a placeholder count).
  const { data: hiddenCountData } = await supabase.rpc(
    "count_hidden_sensitive_notes",
    { p_resident_id: id }
  );
  const hiddenSensitiveCount =
    typeof hiddenCountData === "number" ? hiddenCountData : 0;

  const { data: contactsData } = await supabase
    .from("family_contacts")
    .select("*")
    .eq("resident_id", id)
    .order("is_primary", { ascending: false });

  const familyContacts = (contactsData ?? []) as FamilyContact[];
  const isAdmin = user.role === "admin";

  const { data: assignedData } = await supabase
    .from("resident_clinicians")
    .select(
      "id, clinician_id, relationship, is_primary, clinicians(full_name, email, specialty)"
    )
    .eq("resident_id", id);

  const assignedClinicians: AssignedClinician[] = (
    (assignedData ?? []) as Array<{
      id: string;
      clinician_id: string;
      relationship: string;
      is_primary: boolean;
      clinicians: {
        full_name: string;
        email: string;
        specialty: string | null;
      } | null;
    }>
  )
    .filter((row) => row.clinicians !== null)
    .map((row) => ({
      assignment_id: row.id,
      clinician_id: row.clinician_id,
      full_name: row.clinicians!.full_name,
      email: row.clinicians!.email,
      specialty: row.clinicians!.specialty,
      relationship: row.relationship,
      is_primary: row.is_primary,
    }));

  const { data: directoryData } = await supabase
    .from("clinicians")
    .select("id, full_name, email, specialty")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .order("full_name");

  const clinicianDirectory = (directoryData ?? []) as DirectoryClinician[];

  const { data: capacityData } = await supabase
    .from("resident_decisional_capacity")
    .select("capacity_status, representative_name, representative_relationship")
    .eq("resident_id", id)
    .maybeSingle();
  const capacity = capacityData as {
    capacity_status: string;
    representative_name: string | null;
    representative_relationship: string | null;
  } | null;

  const isDeletedPending = resident.status === "deleted_pending";
  const residentDisplayName = `${resident.first_name} ${resident.last_name}`;

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      {isAdmin && isDeletedPending && (
        <ResidentDeleteControls
          residentId={id}
          residentName={residentDisplayName}
          status={resident.status}
          variant="banner"
        />
      )}

      {/* Resident header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {resident.first_name} {resident.last_name}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            {resident.room_number && (
              <span className="text-sm text-muted-foreground">
                Room {resident.room_number}
              </span>
            )}
            <Badge variant="secondary" className="capitalize">
              {resident.status.replace("_", " ")}
            </Badge>
          </div>
        </div>
        {!isDeletedPending && (
          <div className="flex gap-1.5 flex-wrap justify-end">
            <QuickSummaryButton
              residentId={id}
              residentDisplay={residentDisplayName}
            />
            <ExportReportButton
              residentId={id}
              residentDisplay={residentDisplayName}
            />
            {isAdmin && (
              <>
                <Link href={`/family/${id}/new`}>
                  <Button variant="outline" size="sm">
                    <Mail className="mr-1 h-3 w-3" />
                    Family Update
                  </Button>
                </Link>
                <Link href={`/residents/${id}/edit`}>
                  <Button variant="outline" size="sm">
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                </Link>
                <ResidentDeleteControls
                  residentId={id}
                  residentName={residentDisplayName}
                  status={resident.status}
                  variant="header-button"
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Decisional capacity */}
      {isAdmin && (
        <div className="mb-4 rounded-xl border bg-card p-3 text-sm flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="font-medium flex items-center gap-1.5">
              {capacity?.capacity_status === "full" ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-green-600" />
                  Full capacity
                </>
              ) : capacity?.capacity_status ===
                "diminished_with_representative" ? (
                <>
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  Diminished — representative on file
                </>
              ) : capacity?.capacity_status === "lacks_capacity" ? (
                <>
                  <ShieldX className="h-4 w-4 text-destructive" />
                  Lacks capacity
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  Capacity not assessed
                </>
              )}
            </div>
            {capacity?.representative_name && (
              <p className="text-xs text-muted-foreground">
                Representative: {capacity.representative_name}
                {capacity.representative_relationship
                  ? ` · ${capacity.representative_relationship}`
                  : ""}
              </p>
            )}
            {!capacity && (
              <p className="text-xs text-muted-foreground">
                Capture the resident&apos;s decisional capacity before
                recording any voice content or capturing consent.
              </p>
            )}
          </div>
          <Link href={`/residents/${id}/capacity`}>
            <Button variant="outline" size="sm">
              {capacity ? "Manage" : "Assess"}
            </Button>
          </Link>
        </div>
      )}

      {/* Conditions & Preferences */}
      {(resident.conditions || resident.preferences) && (
        <div className="mb-4 rounded-xl border bg-card p-3 text-sm space-y-1">
          {resident.conditions && (
            <p>
              <span className="font-medium">Conditions:</span>{" "}
              {resident.conditions}
            </p>
          )}
          {resident.preferences && (
            <p>
              <span className="font-medium">Preferences:</span>{" "}
              {resident.preferences}
            </p>
          )}
        </div>
      )}

      {/* Family contacts */}
      <FamilyContactList
        contacts={familyContacts}
        residentId={id}
        isAdmin={isAdmin}
      />

      {/* Treating clinicians */}
      <ResidentClinicianList
        residentId={id}
        assigned={assignedClinicians}
        directory={clinicianDirectory}
        isAdmin={isAdmin}
      />

      {/* Note input */}
      <div className="mt-6 mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-medium">Add Note</h3>
          <VoiceCallButton residentId={id} />
        </div>
        <NoteInputForm
          residentId={id}
          organizationId={user.organization_id}
        />
      </div>

      <Separator />

      {/* Note timeline */}
      <div className="mt-5 space-y-3">
        <h3 className="text-base font-medium">Notes</h3>
        <NoteFilters
          initial={{
            start: filters.start,
            end: filters.end,
            search: filters.search,
            incidents: filters.incidents ? "1" : undefined,
          }}
        />
        {initialNotes.length === 0 && hiddenSensitiveCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filters.start || filters.end || filters.search || filters.incidents
              ? "No notes match the current filters."
              : "No notes for this resident yet."}
          </p>
        ) : (
          <NotesInfiniteList
            key={JSON.stringify(filters)}
            residentId={id}
            initialNotes={initialNotes}
            hasMore={hasMoreNotes}
            hiddenSensitiveCount={hiddenSensitiveCount}
            filters={filters}
            canRetry={isAdmin || user.role === "compliance_admin"}
          />
        )}
      </div>
    </div>
  );
}
