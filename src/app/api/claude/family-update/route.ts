import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callClaude, parseJsonResponse } from "@/lib/claude";
import {
  FAMILY_UPDATE_SYSTEM_PROMPT,
  buildFamilyUpdateUserPrompt,
  type FamilyUpdateOutput,
} from "@/lib/prompts/family-update";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { residentId, contactId, dateRangeStart, dateRangeEnd } =
    await request.json();

  if (!residentId || !contactId || !dateRangeStart || !dateRangeEnd) {
    return NextResponse.json(
      { error: "residentId, contactId, dateRangeStart, dateRangeEnd required" },
      { status: 400 }
    );
  }

  // Fetch resident
  const { data: resident } = await supabase
    .from("residents")
    .select("first_name, last_name, organization_id")
    .eq("id", residentId)
    .single();

  if (!resident) {
    return NextResponse.json({ error: "Resident not found" }, { status: 404 });
  }

  const typedResident = resident as {
    first_name: string;
    last_name: string;
    organization_id: string;
  };

  // Fetch org
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", typedResident.organization_id)
    .single();

  // Fetch contact
  const { data: contact } = await supabase
    .from("family_contacts")
    .select("name, relationship")
    .eq("id", contactId)
    .single();

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const typedContact = contact as { name: string; relationship: string };
  const typedOrg = org as { name: string } | null;

  // Fetch notes in date range
  const { data: notesData } = await supabase
    .from("notes")
    .select("created_at, structured_output, author_id")
    .eq("resident_id", residentId)
    .eq("is_structured", true)
    .gte("created_at", dateRangeStart)
    .lte("created_at", dateRangeEnd + "T23:59:59Z")
    .order("created_at", { ascending: true });

  const notes = (notesData ?? []) as Array<{
    created_at: string;
    structured_output: string;
    author_id: string;
  }>;

  if (notes.length === 0) {
    return NextResponse.json(
      { error: "No structured notes found in this date range" },
      { status: 400 }
    );
  }

  // Fetch author names
  const authorIds = [...new Set(notes.map((n) => n.author_id))];
  const { data: authors } = await supabase
    .from("users")
    .select("id, full_name")
    .in("id", authorIds);

  const authorMap = new Map(
    ((authors ?? []) as Array<{ id: string; full_name: string }>).map((a) => [
      a.id,
      a.full_name,
    ])
  );

  try {
    const raw = await callClaude({
      systemPrompt: FAMILY_UPDATE_SYSTEM_PROMPT,
      userPrompt: buildFamilyUpdateUserPrompt({
        facilityName: typedOrg?.name || "Our Facility",
        residentFirstName: typedResident.first_name,
        residentLastName: typedResident.last_name,
        familyContactName: typedContact.name,
        relationship: typedContact.relationship,
        dateRangeStart,
        dateRangeEnd,
        notes: notes.map((n) => ({
          created_at: n.created_at,
          author_name: authorMap.get(n.author_id) || "Staff",
          structured_output: n.structured_output,
        })),
      }),
      maxTokens: 1024,
    });

    const update = parseJsonResponse<FamilyUpdateOutput>(raw);

    return NextResponse.json({
      subject: update.subject,
      body: update.body,
      sourceNoteIds: notes.map((n) => (n as unknown as { id: string }).id),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate family update", details: message },
      { status: 500 }
    );
  }
}
