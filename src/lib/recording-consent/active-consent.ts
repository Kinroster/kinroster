import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentClass, RecordingJurisdiction } from "./consent-text";

export type RegulatoryRegion = "hipaa_us" | "pdpa_tw" | "gdpr_eu";

/**
 * Resolve the expected recording-consent jurisdiction for an
 * organization. Two-step lookup:
 *
 *   1. Explicit org-level override at
 *      organizations.settings.voice_recording_jurisdiction — set by
 *      admins in HIPAA-US orgs whose facility is in a two-party-consent
 *      state (CA, IL, WA, FL, MA, MT, NH, PA, MD) or who want to opt
 *      into a stricter regime.
 *   2. Fall back to the org's regulatory_region:
 *        hipaa_us → 'default' (one-party-consent baseline)
 *        pdpa_tw  → 'pdpa_tw'
 *        gdpr_eu  → 'gdpr_eu'
 *
 * The voice/start gate uses this resolved value to match the active
 * consent's `jurisdiction` field. Mismatch BLOCKS the call — restrictive
 * by design (a resident move across state lines forces re-capture).
 */
export function resolveExpectedJurisdiction(
  regulatoryRegion: RegulatoryRegion,
  settings: Record<string, unknown> | null | undefined
): RecordingJurisdiction {
  const override = settings?.voice_recording_jurisdiction;
  if (typeof override === "string" && isRecordingJurisdiction(override)) {
    return override;
  }
  if (regulatoryRegion === "pdpa_tw") return "pdpa_tw";
  if (regulatoryRegion === "gdpr_eu") return "gdpr_eu";
  return "default";
}

const ALL_JURISDICTIONS: RecordingJurisdiction[] = [
  "us_ca",
  "us_il",
  "us_wa",
  "us_fl",
  "us_tx",
  "us_ma",
  "us_mt",
  "us_nh",
  "us_pa",
  "us_md",
  "default",
  "pdpa_tw",
  "gdpr_eu",
];

export function isRecordingJurisdiction(
  s: string
): s is RecordingJurisdiction {
  return (ALL_JURISDICTIONS as string[]).includes(s);
}

/**
 * Returns the active (withdrawn_at IS NULL) recording consent for the
 * given resident + class, or null if none exists. Org scoping is
 * enforced by RLS. The most recent row wins if multiple were captured
 * (shouldn't happen, but defensive against double-clicks).
 */
export async function getActiveRecordingConsent(
  supabase: SupabaseClient,
  residentId: string,
  consentClass: ConsentClass
): Promise<{
  id: string;
  jurisdiction: string;
  consent_text_version: string;
  attorney_reviewed: boolean;
  consented_at: string;
} | null> {
  const { data, error } = await supabase
    .from("resident_recording_consents")
    .select(
      "id, jurisdiction, consent_text_version, attorney_reviewed, consented_at"
    )
    .eq("resident_id", residentId)
    .eq("consent_class", consentClass)
    .is("withdrawn_at", null)
    .order("consented_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as {
    id: string;
    jurisdiction: string;
    consent_text_version: string;
    attorney_reviewed: boolean;
    consented_at: string;
  };
}

export type RecordingConsentCheck =
  | { allowed: true; consentId: string; jurisdiction: RecordingJurisdiction }
  | {
      allowed: false;
      code:
        | "no_consent"
        | "jurisdiction_mismatch"
        | "consent_lookup_failed";
      expectedJurisdiction: RecordingJurisdiction;
      actualJurisdiction?: string;
      consentId?: string;
    };

/**
 * Hard-gate check used by /api/voice/start, /api/family/memos, etc.
 * Verifies that an active consent exists for the (resident, class)
 * tuple AND that the consent's jurisdiction matches the org's expected
 * jurisdiction. The two-tier check (presence + jurisdiction) is the
 * core CIPA / GDPR / PDPA defense.
 */
export async function checkRecordingConsent(
  supabase: SupabaseClient,
  residentId: string,
  consentClass: ConsentClass,
  expectedJurisdiction: RecordingJurisdiction
): Promise<RecordingConsentCheck> {
  const active = await getActiveRecordingConsent(
    supabase,
    residentId,
    consentClass
  );
  if (!active) {
    return {
      allowed: false,
      code: "no_consent",
      expectedJurisdiction,
    };
  }
  if (active.jurisdiction !== expectedJurisdiction) {
    return {
      allowed: false,
      code: "jurisdiction_mismatch",
      expectedJurisdiction,
      actualJurisdiction: active.jurisdiction,
      consentId: active.id,
    };
  }
  return {
    allowed: true,
    consentId: active.id,
    jurisdiction: expectedJurisdiction,
  };
}
