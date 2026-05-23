import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import type {
  Resident,
  ResidentRecordingConsent,
} from "@/types/database";
import { RecordingConsentManager } from "@/components/recording-consent/recording-consent-manager";
import {
  ATTORNEY_REVIEWED,
  CONSENT_TEXT_VERSION,
} from "@/lib/recording-consent/consent-text";
import {
  resolveExpectedJurisdiction,
  type RegulatoryRegion,
} from "@/lib/recording-consent/active-consent";

export default async function ResidentRecordingConsentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: residentId } = await params;
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: residentData } = await supabase
    .from("residents")
    .select("*")
    .eq("id", residentId)
    .eq("organization_id", user.organization_id)
    .single();
  const resident = residentData as Resident | null;
  if (!resident) notFound();

  const { data: consentsData } = await supabase
    .from("resident_recording_consents")
    .select("*")
    .eq("resident_id", residentId)
    .order("consented_at", { ascending: false });
  const consents =
    (consentsData as ResidentRecordingConsent[] | null) ?? [];

  const { data: orgData } = await supabase
    .from("organizations")
    .select("name, email_reply_to, regulatory_region, settings")
    .eq("id", user.organization_id)
    .single();
  const typedOrg = orgData as
    | {
        name: string;
        email_reply_to: string | null;
        regulatory_region: string;
        settings: Record<string, unknown> | null;
      }
    | null;

  const region: RegulatoryRegion =
    (typedOrg?.regulatory_region as RegulatoryRegion) ?? "hipaa_us";
  const expectedJurisdiction = resolveExpectedJurisdiction(
    region,
    typedOrg?.settings ?? null
  );

  const residentFullName =
    `${resident.first_name} ${resident.last_name}`.trim();

  return (
    <div className="px-4 py-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold">
          Recording consent — {residentFullName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Captures the resident&apos;s (or representative&apos;s) consent
          to voice recording and transcription. Distinct from PDPA / PHI
          processing consent. The voice-start gate hard-blocks calls
          without an active consent in the matching class and jurisdiction.
        </p>
      </div>

      {!ATTORNEY_REVIEWED && (
        <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          <p className="font-medium">
            Consent text is PROVISIONAL — not attorney-reviewed.
          </p>
          <p className="text-xs mt-1">
            Version <code>{CONSENT_TEXT_VERSION}</code>. Captured records
            stamp this version so they can be re-captured later under
            jurisdiction-specific attorney-approved copy. See{" "}
            <code>src/lib/recording-consent/consent-text.ts</code>.
          </p>
        </div>
      )}

      <RecordingConsentManager
        residentId={residentId}
        residentName={residentFullName}
        orgName={typedOrg?.name ?? "Kinroster"}
        dpoEmail={typedOrg?.email_reply_to ?? "privacy@kinroster.com"}
        expectedJurisdiction={expectedJurisdiction}
        consents={consents}
        attorneyReviewed={ATTORNEY_REVIEWED}
        consentTextVersion={CONSENT_TEXT_VERSION}
      />
    </div>
  );
}
