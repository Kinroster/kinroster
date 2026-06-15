import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkQuotaAndIncrement } from "@/lib/quota";
import { logAudit } from "@/lib/audit";
import { getCaregiverLocale } from "@/lib/i18n/locale";
import { authorTypeFromRole } from "@/lib/notes/author-type";

// Resident onboarding call — collects all resident fields conversationally.
// The Vapi assistant (VAPI_ONBOARDING_ASSISTANT_ID) will ask for:
//   first name, last name, date of birth, room number, conditions,
//   preferences, care context, preferred language, country of origin,
//   religion, dietary restrictions, cultural taboos, honorific.
// After the call ends the client POSTs sessionId to /api/voice/process-onboarding
// which runs Claude extraction and creates the resident row.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recordingConsentAccepted, recordingConsentVersion } =
    await request.json();

  if (!recordingConsentAccepted) {
    return NextResponse.json(
      {
        error: "Recording consent required.",
        consent_required: true,
      },
      { status: 400 }
    );
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("id, full_name, organization_id, role")
    .eq("id", authUser.id)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const quota = await checkQuotaAndIncrement(appUser.organization_id, "voice");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  const { data: session, error: insertError } = await supabase
    .from("voice_sessions")
    .insert({
      organization_id: appUser.organization_id,
      caregiver_id: appUser.id,
      author_id: appUser.id,
      author_type: authorTypeFromRole(
        (appUser as { role?: string | null }).role
      ),
      call_type: "resident_onboarding",
      status: "initiated",
    })
    .select()
    .single();

  if (insertError || !session) {
    return NextResponse.json(
      { error: "Failed to create voice session", details: insertError?.message },
      { status: 500 }
    );
  }

  const sessionId = (session as { id: string }).id;

  await logAudit({
    organizationId: appUser.organization_id,
    userId: appUser.id,
    eventType: "permission_change",
    objectType: "user",
    objectId: appUser.id,
    request,
    metadata: {
      action: "voice_recording_consent",
      consent_version:
        typeof recordingConsentVersion === "string"
          ? recordingConsentVersion
          : "v1",
      voice_session_id: sessionId,
    },
  });

  const caregiverLanguage = await getCaregiverLocale(appUser.id);
  const firstName = (appUser.full_name ?? "").split(" ")[0] || "there";

  const assistantOverrides = {
    variableValues: {
      caregiver_name: appUser.full_name ?? "Caregiver",
      caregiver_language: caregiverLanguage,
    },
    firstMessage: `Hi ${firstName}! I'll help you add a new resident. Let's start with their name — what's the resident's first and last name?`,
    firstMessageMode: "assistant-speaks-first" as const,
    metadata: { sessionId, call_type: "resident_onboarding" },
  };

  return NextResponse.json({
    sessionId,
    assistantId:
      process.env.VAPI_ONBOARDING_ASSISTANT_ID ?? process.env.VAPI_ASSISTANT_ID,
    publicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
    assistantOverrides,
  });
}
