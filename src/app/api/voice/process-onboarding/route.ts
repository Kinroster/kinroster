import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callClaude, parseJsonResponse } from "@/lib/claude";

const SYSTEM_PROMPT = `You are extracting resident intake information from a voice call transcript between a caregiver and an AI assistant.

The AI assistant was collecting details for a new care facility resident. Extract all resident fields mentioned in the conversation.

Return a JSON object with these fields (all optional except first_name and last_name):
{
  "first_name": string,
  "last_name": string,
  "date_of_birth": "YYYY-MM-DD" | null,
  "room_number": string | null,
  "conditions": string | null,
  "preferences": string | null,
  "care_notes_context": string | null,
  "preferred_language": string | null,
  "country_of_origin": string | null,
  "religion": string | null,
  "dietary_restrictions": string[],
  "cultural_taboos": string[],
  "honorific_preference": string | null,
  "family_name": string | null,
  "given_name": string | null
}

Rules:
- Only include information explicitly stated in the transcript
- dietary_restrictions and cultural_taboos must be arrays (empty [] if not mentioned)
- For date_of_birth, convert any format to YYYY-MM-DD; null if not mentioned or unclear
- conditions should be a comma-separated summary of medical conditions
- Return ONLY valid JSON, no extra text`;

interface ResidentExtraction {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  room_number?: string | null;
  conditions?: string | null;
  preferences?: string | null;
  care_notes_context?: string | null;
  preferred_language?: string | null;
  country_of_origin?: string | null;
  religion?: string | null;
  dietary_restrictions?: string[];
  cultural_taboos?: string[];
  honorific_preference?: string | null;
  family_name?: string | null;
  given_name?: string | null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await request.json();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("id, organization_id")
    .eq("id", authUser.id)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Fetch the voice session (must belong to this org, must be onboarding type)
  const { data: session } = await supabase
    .from("voice_sessions")
    .select("id, full_transcript, call_type, status, organization_id")
    .eq("id", sessionId)
    .eq("organization_id", appUser.organization_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if ((session as { call_type: string }).call_type !== "resident_onboarding") {
    return NextResponse.json(
      { error: "Session is not a resident onboarding call" },
      { status: 400 }
    );
  }

  const transcript = (session as { full_transcript?: string | null }).full_transcript;
  if (!transcript || transcript.trim().length < 10) {
    return NextResponse.json(
      { error: "Call transcript is empty or too short to extract resident data" },
      { status: 422 }
    );
  }

  // Extract resident fields from the transcript using Claude
  let extracted: ResidentExtraction;
  try {
    const raw = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Transcript:\n\n${transcript}`,
      maxTokens: 800,
    });
    const parsed = parseJsonResponse<ResidentExtraction>(raw);
    if (!parsed || !parsed.first_name || !parsed.last_name) {
      return NextResponse.json(
        { error: "Could not extract resident name from transcript. Please try again or fill in the form manually." },
        { status: 422 }
      );
    }
    extracted = parsed;
  } catch {
    return NextResponse.json(
      { error: "Failed to process transcript. Please fill in the resident form manually." },
      { status: 500 }
    );
  }

  // Create the resident record
  const { data: resident, error: insertError } = await supabase
    .from("residents")
    .insert({
      organization_id: appUser.organization_id,
      first_name: extracted.first_name!,
      last_name: extracted.last_name!,
      date_of_birth: extracted.date_of_birth ?? null,
      room_number: extracted.room_number ?? null,
      conditions: extracted.conditions ?? null,
      preferences: extracted.preferences ?? null,
      care_notes_context: extracted.care_notes_context ?? null,
      preferred_language: extracted.preferred_language ?? null,
      country_of_origin: extracted.country_of_origin ?? null,
      religion: extracted.religion ?? null,
      dietary_restrictions: extracted.dietary_restrictions ?? [],
      cultural_taboos: extracted.cultural_taboos ?? [],
      honorific_preference: extracted.honorific_preference ?? null,
      family_name: extracted.family_name ?? null,
      given_name: extracted.given_name ?? null,
    })
    .select()
    .single();

  if (insertError || !resident) {
    return NextResponse.json(
      { error: "Failed to create resident", details: insertError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    residentId: (resident as { id: string }).id,
    extracted,
  });
}
