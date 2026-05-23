import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAssistantOverrides } from "@/lib/vapi";
import { checkQuotaAndIncrement } from "@/lib/quota";
import { logAudit } from "@/lib/audit";
import { getCaregiverLocale, getResidentContext } from "@/lib/i18n/locale";
import { getEffectiveStructuredOutputForLlm } from "@/lib/notes/effective-output";
import {
  hasActivePdpaConsent,
  hasCaregiverPdpaConsent,
  pdpaConsentRequired,
} from "@/lib/pdpa/active-consent";
import {
  checkRecordingConsent,
  resolveExpectedJurisdiction,
  type RegulatoryRegion,
} from "@/lib/recording-consent/active-consent";
import {
  threadBodyOrEmpty,
  type ThreadBody,
} from "@/lib/prompts/thread-update";

interface NoteSummaryRow {
  created_at: string;
  structured_output: string | null;
  edited_output: string | null;
  flagged_as_incident: boolean | null;
}

function extractSummary(structuredOutput: string | null): string | null {
  if (!structuredOutput) return null;
  try {
    const parsed = JSON.parse(structuredOutput) as { summary?: unknown };
    return typeof parsed.summary === "string" ? parsed.summary : null;
  } catch {
    return null;
  }
}

function formatRecentNotes(rows: NoteSummaryRow[]): string {
  const lines = rows
    .map((row) => {
      const summary = extractSummary(getEffectiveStructuredOutputForLlm(row));
      if (!summary) return null;
      const date = row.created_at.slice(0, 10);
      return `${date}: ${summary}`;
    })
    .filter((s): s is string => s !== null);
  return lines.length === 0 ? "" : lines.join("\n");
}

function formatRecentIncidents(rows: NoteSummaryRow[]): string {
  const lines = rows
    .filter((r) => r.flagged_as_incident)
    .map((row) => {
      const summary = extractSummary(getEffectiveStructuredOutputForLlm(row));
      const date = row.created_at.slice(0, 10);
      return summary
        ? `${date}: ${summary}`
        : `${date}: (incident, no summary)`;
    });
  return lines.length === 0 ? "" : lines.join("\n");
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { residentId, recordingConsentAccepted, recordingConsentVersion } =
    await request.json();
  if (!residentId) {
    return NextResponse.json({ error: "residentId required" }, { status: 400 });
  }

  // Recording consent gate. The voice call captures the caregiver's speech
  // and transcribes it as part of the care record, which under some state
  // laws (CA CIPA, IL BIPA) touches two-party-consent and biometric
  // information requirements. The client persists the acknowledgment in
  // localStorage; the server enforces the gate and records the consent on
  // the audit log so we can show it was captured if ever asked.
  if (!recordingConsentAccepted) {
    return NextResponse.json(
      {
        error:
          "Recording consent required. Please acknowledge the consent disclosure to start a voice call.",
        consent_required: true,
      },
      { status: 400 }
    );
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("id, full_name, organization_id")
    .eq("id", authUser.id)
    .single();

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const quota = await checkQuotaAndIncrement(appUser.organization_id, "voice");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.reason }, { status: 429 });
  }

  const { data: resident } = await supabase
    .from("residents")
    .select(
      "id, first_name, last_name, conditions, care_notes_context, organization_id, given_name, family_name"
    )
    .eq("id", residentId)
    .eq("organization_id", appUser.organization_id)
    .single();

  if (!resident) {
    return NextResponse.json({ error: "Resident not found" }, { status: 404 });
  }

  // PDPA gate. Independent of the per-call recording consent above:
  // recordingConsentAccepted attests "the caregiver acknowledged the call
  // is recorded"; this gate attests "the resident has on-file PDPA
  // consent to have their data processed at all." Off by default;
  // organizations.settings.pdpa_consent_required = true flips it on.
  const { data: orgSettingsRow } = await supabase
    .from("organizations")
    .select("settings, regulatory_region")
    .eq("id", appUser.organization_id)
    .single();
  const typedOrgSettings = orgSettingsRow as
    | {
        settings: Record<string, unknown> | null;
        regulatory_region: string;
      }
    | null;

  // Phase 0b gate: per-resident recording consent must exist in the
  // 'staff_dictation' class AND match the org's expected jurisdiction.
  // Hard-block. The voice/start path is the highest-stakes recording
  // surface in the app — caregivers + admins dictate observations that
  // contain the resident's PHI. CIPA / BIPA / GDPR Art. 9 / Taiwan PDPA
  // Art. 7 all require specific, jurisdiction-appropriate consent
  // before that recording occurs. Mismatch (e.g., consent captured
  // under CA but org is now in WA) blocks until re-capture.
  const region: RegulatoryRegion =
    (typedOrgSettings?.regulatory_region as RegulatoryRegion) ?? "hipaa_us";
  const expectedJurisdiction = resolveExpectedJurisdiction(
    region,
    typedOrgSettings?.settings ?? null
  );
  const recordingCheck = await checkRecordingConsent(
    supabase,
    resident.id,
    "staff_dictation",
    expectedJurisdiction
  );
  if (!recordingCheck.allowed) {
    await logAudit({
      organizationId: appUser.organization_id,
      userId: appUser.id,
      eventType: "recording_consent_blocked",
      objectType: "resident",
      objectId: resident.id,
      result: "denied",
      request,
      metadata: {
        code: recordingCheck.code,
        expected_jurisdiction: recordingCheck.expectedJurisdiction,
        actual_jurisdiction:
          "actualJurisdiction" in recordingCheck
            ? recordingCheck.actualJurisdiction
            : null,
      },
    });
    return NextResponse.json(
      {
        error:
          recordingCheck.code === "no_consent"
            ? "Voice recording consent missing. An admin must capture staff_dictation consent for this resident before voice intake can be used."
            : "Voice recording consent jurisdiction mismatch. The active consent's jurisdiction does not match the organization's expected jurisdiction; an admin must re-capture under the correct jurisdiction.",
        code: recordingCheck.code,
        expected_jurisdiction: recordingCheck.expectedJurisdiction,
        actual_jurisdiction:
          "actualJurisdiction" in recordingCheck
            ? recordingCheck.actualJurisdiction
            : undefined,
      },
      { status: 403 }
    );
  }

  if (pdpaConsentRequired(typedOrgSettings?.settings)) {
    const [residentOk, caregiverOk] = await Promise.all([
      hasActivePdpaConsent(supabase, resident.id),
      hasCaregiverPdpaConsent(supabase, appUser.id),
    ]);
    if (!residentOk || !caregiverOk) {
      return NextResponse.json(
        {
          error:
            "PDPA consent missing. Both the resident's PHI consent and the caregiver's standing PDPA consent must be on file before starting voice intake.",
          code: "pdpa_consent_required",
          missing: {
            resident: !residentOk,
            caregiver: !caregiverOk,
          },
        },
        { status: 403 }
      );
    }
  }

  const { data: session, error: insertError } = await supabase
    .from("voice_sessions")
    .insert({
      organization_id: appUser.organization_id,
      resident_id: resident.id,
      caregiver_id: appUser.id,
      call_type: "caregiver_intake",
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
      resident_id: resident.id,
    },
  });

  // Locale + cultural context for prompt phrasing.
  const [caregiverLanguage, residentContext] = await Promise.all([
    getCaregiverLocale(appUser.id),
    getResidentContext(resident.id),
  ]);

  // Grounding: Phase 1 prefers the rolling conversation thread. Fall
  // back to the legacy last-5-notes + 14-day-incidents stitching when
  // no thread exists yet (first call for this resident, or the Inngest
  // updater hasn't run yet). Once the thread updater is stable, the
  // fallback path can be removed.
  const { data: threadRow } = await supabase
    .from("resident_conversation_threads")
    .select("body, version, update_giving_up, last_updated_at")
    .eq("resident_id", resident.id)
    .eq("organization_id", appUser.organization_id)
    .maybeSingle();

  const threadBody: ThreadBody = threadBodyOrEmpty(
    (threadRow as { body: unknown } | null)?.body as never
  );
  const threadHasContent =
    threadBody.narrative.length > 0 || threadBody.active_concerns.length > 0;

  let recentNotesSummary: string;
  let recentIncidentsLine: string;

  if (threadHasContent) {
    const concernsLine = threadBody.active_concerns
      .map((c) => `${c.concern} (${c.trend}, since ${c.since})`)
      .join("; ");
    recentNotesSummary = concernsLine
      ? `${threadBody.narrative}\n\nActive concerns: ${concernsLine}`
      : threadBody.narrative;
    recentIncidentsLine = threadBody.recent_incidents
      .map((i) => `${i.date}: ${i.summary}`)
      .join("\n");
  } else {
    // Legacy fallback path.
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();
    const [recentNotesRes, recentIncidentsRes] = await Promise.all([
      supabase
        .from("notes")
        .select(
          "created_at, structured_output, edited_output, flagged_as_incident"
        )
        .eq("resident_id", resident.id)
        .eq("organization_id", appUser.organization_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("notes")
        .select(
          "created_at, structured_output, edited_output, flagged_as_incident"
        )
        .eq("resident_id", resident.id)
        .eq("organization_id", appUser.organization_id)
        .eq("flagged_as_incident", true)
        .gte("created_at", fourteenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const recentNotes = (recentNotesRes.data ?? []) as NoteSummaryRow[];
    const recentIncidents = (recentIncidentsRes.data ?? []) as NoteSummaryRow[];
    recentNotesSummary = formatRecentNotes(recentNotes);
    recentIncidentsLine = formatRecentIncidents(recentIncidents);
  }

  // Per-call keyterms boost Deepgram recognition for resident name + meds.
  // Conditions are a free-text comma/space-delimited string today; split and
  // keep short tokens that look like names rather than narratives.
  const conditionTokens = (resident.conditions ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 32);

  const keyterms = [
    resident.given_name || resident.first_name,
    resident.family_name || resident.last_name,
    ...conditionTokens,
  ].filter((s): s is string => Boolean(s));

  // We force model-generated greeting so the assistant uses the
  // system-prompt's language-specific templates (which interpolate
  // {{resident_first_name}} etc.) instead of the static English
  // firstMessage configured in the Vapi dashboard. The caregiver is
  // already in the resident's portal — the assistant should NOT ask
  // "which resident are you reporting on?".
  const assistantOverrides = {
    ...buildAssistantOverrides({
      caregiverName: appUser.full_name,
      caregiverLanguage,
      residentFirstName: resident.given_name || resident.first_name,
      residentLastName: resident.family_name || resident.last_name,
      residentLanguage: residentContext.preferred_language || caregiverLanguage,
      outputLanguage: residentContext.output_language,
      honorificPreference: residentContext.honorific_preference,
      culturalRegister: residentContext.cultural_register,
      conditions: resident.conditions,
      careNotesContext: resident.care_notes_context,
      recentNotesSummary,
      recentIncidents: recentIncidentsLine,
      keyterms,
    }),
    firstMessageMode:
      "assistant-speaks-first-with-model-generated-message" as const,
    metadata: { sessionId },
  };

  return NextResponse.json({
    sessionId,
    assistantId: process.env.VAPI_ASSISTANT_ID,
    publicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
    assistantOverrides,
  });
}
