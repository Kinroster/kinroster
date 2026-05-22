import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

// Phase 0a: capture / update a resident's decisional-capacity assessment.
// One CURRENT row per resident (UNIQUE on resident_id at the DB layer).
// PUT replaces the entire assessment; the snapshot_capacity_history
// trigger captures prior/new field deltas into the append-only history
// table. DELETE clears the assessment (rare; for corrections).

const CAPACITY_STATUSES = [
  "full",
  "diminished_with_representative",
  "lacks_capacity",
] as const;

const AUTHORITY_BASES = [
  "poa_healthcare",
  "court_guardian",
  "next_of_kin",
  "spouse",
  "other",
] as const;

type CapacityStatus = (typeof CAPACITY_STATUSES)[number];
type AuthorityBasis = (typeof AUTHORITY_BASES)[number];

interface UpsertBody {
  capacityStatus: CapacityStatus;
  representativeName?: string | null;
  representativeRelationship?: string | null;
  authorityBasis?: AuthorityBasis | null;
  documentationUri?: string | null;
  notes?: string | null;
  nextReviewDueAt?: string | null;
}

function isCapacityStatus(s: unknown): s is CapacityStatus {
  return (
    typeof s === "string" &&
    (CAPACITY_STATUSES as readonly string[]).includes(s)
  );
}

function isAuthorityBasis(s: unknown): s is AuthorityBasis {
  return (
    typeof s === "string" &&
    (AUTHORITY_BASES as readonly string[]).includes(s)
  );
}

async function loadAdminAndResident(
  request: NextRequest,
  residentId: string
): Promise<
  | NextResponse
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      userId: string;
      orgId: string;
      resident: { id: string; organization_id: string };
    }
> {
  void request; // not used for auth context yet
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();
  const typedUser = appUser as
    | { organization_id: string; role: string }
    | null;
  if (!typedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (typedUser.role !== "admin" && typedUser.role !== "compliance_admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { data: resident } = await supabase
    .from("residents")
    .select("id, organization_id")
    .eq("id", residentId)
    .single();
  const typedResident = resident as
    | { id: string; organization_id: string }
    | null;
  if (!typedResident) {
    return NextResponse.json({ error: "Resident not found" }, { status: 404 });
  }
  if (typedResident.organization_id !== typedUser.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    supabase,
    userId: user.id,
    orgId: typedUser.organization_id,
    resident: typedResident,
  };
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: residentId } = await context.params;
  const ctx = await loadAdminAndResident(request, residentId);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, userId, orgId, resident } = ctx;

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isCapacityStatus(body.capacityStatus)) {
    return NextResponse.json(
      { error: "Invalid capacityStatus" },
      { status: 400 }
    );
  }

  const repName = body.representativeName?.trim() || null;
  const repRel = body.representativeRelationship?.trim() || null;
  const authBasis = body.authorityBasis ?? null;
  const docUri = body.documentationUri?.trim() || null;
  const notes = body.notes?.trim() || null;
  const nextReview = body.nextReviewDueAt?.trim() || null;

  if (body.capacityStatus !== "full") {
    if (!repName || !repRel || !authBasis) {
      return NextResponse.json(
        {
          error:
            "Representative name, relationship, and authority basis are required when capacity is not full",
        },
        { status: 400 }
      );
    }
    if (!isAuthorityBasis(authBasis)) {
      return NextResponse.json(
        { error: "Invalid authorityBasis" },
        { status: 400 }
      );
    }
  }

  if (nextReview && Number.isNaN(Date.parse(nextReview))) {
    return NextResponse.json(
      { error: "Invalid nextReviewDueAt timestamp" },
      { status: 400 }
    );
  }

  // Find existing row (one per resident).
  const { data: existing } = await supabase
    .from("resident_decisional_capacity")
    .select("id")
    .eq("resident_id", resident.id)
    .maybeSingle();
  const existingRow = existing as { id: string } | null;

  const payload = {
    organization_id: orgId,
    resident_id: resident.id,
    capacity_status: body.capacityStatus,
    representative_name:
      body.capacityStatus === "full" ? null : repName,
    representative_relationship:
      body.capacityStatus === "full" ? null : repRel,
    authority_basis: body.capacityStatus === "full" ? null : authBasis,
    documentation_uri: docUri,
    notes,
    assessed_by_user_id: userId,
    assessed_at: new Date().toISOString(),
    next_review_due_at: nextReview,
  };

  let savedId: string;
  if (existingRow) {
    const { data: updated, error: updateError } = await supabase
      .from("resident_decisional_capacity")
      .update(payload)
      .eq("id", existingRow.id)
      .select("id")
      .single();
    if (updateError || !updated) {
      return NextResponse.json(
        {
          error: "Failed to update capacity assessment",
          details: updateError?.message,
        },
        { status: 500 }
      );
    }
    savedId = (updated as { id: string }).id;
    await logAudit({
      organizationId: orgId,
      userId,
      eventType: "capacity_assessment_update",
      objectType: "capacity_assessment",
      objectId: savedId,
      request,
      metadata: {
        resident_id: resident.id,
        capacity_status: body.capacityStatus,
        authority_basis: payload.authority_basis,
      },
    });
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("resident_decisional_capacity")
      .insert(payload)
      .select("id")
      .single();
    if (insertError || !inserted) {
      return NextResponse.json(
        {
          error: "Failed to create capacity assessment",
          details: insertError?.message,
        },
        { status: 500 }
      );
    }
    savedId = (inserted as { id: string }).id;
    await logAudit({
      organizationId: orgId,
      userId,
      eventType: "capacity_assessment_create",
      objectType: "capacity_assessment",
      objectId: savedId,
      request,
      metadata: {
        resident_id: resident.id,
        capacity_status: body.capacityStatus,
        authority_basis: payload.authority_basis,
      },
    });
  }

  return NextResponse.json({ id: savedId });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: residentId } = await context.params;
  const ctx = await loadAdminAndResident(request, residentId);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, userId, orgId, resident } = ctx;

  const { data: existing } = await supabase
    .from("resident_decisional_capacity")
    .select("id")
    .eq("resident_id", resident.id)
    .maybeSingle();
  const existingRow = existing as { id: string } | null;
  if (!existingRow) {
    return NextResponse.json(
      { error: "No assessment on file" },
      { status: 404 }
    );
  }

  const { error: deleteError } = await supabase
    .from("resident_decisional_capacity")
    .delete()
    .eq("id", existingRow.id);
  if (deleteError) {
    return NextResponse.json(
      {
        error: "Failed to clear capacity assessment",
        details: deleteError.message,
      },
      { status: 500 }
    );
  }

  await logAudit({
    organizationId: orgId,
    userId,
    eventType: "capacity_assessment_delete",
    objectType: "capacity_assessment",
    objectId: existingRow.id,
    request,
    metadata: { resident_id: resident.id },
  });

  return NextResponse.json({ success: true });
}
