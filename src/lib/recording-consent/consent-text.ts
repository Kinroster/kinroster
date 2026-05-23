/**
 * Voice recording consent text — provisional v0.
 *
 * Distinct from PDPA consent (src/lib/pdpa/consent-text.ts): PDPA covers
 * all PHI processing; THIS file covers the specific act of recording
 * someone's voice and transcribing it. Two-party-consent states (CIPA in
 * California, IL BIPA, WA, FL, MA, MT, NH, PA, MD) require explicit
 * consent BEFORE recording, separate from any data-processing consent.
 *
 * STATUS: PROVISIONAL — NOT ATTORNEY-REVIEWED.
 *
 * Every captured consent record stores both `consent_text_version` and
 * `consent_text_snapshot` (the exact rendered string). When attorney copy
 * lands, ATTORNEY_REVIEWED flips to true and CONSENT_TEXT_VERSION bumps;
 * existing v0 consents remain valid records of what was actually shown
 * but can be re-captured under attorney-approved copy.
 *
 * Jurisdictional notes (mapped to RecordingJurisdiction values below):
 *   - us_ca: CIPA two-party consent; civil + criminal exposure.
 *   - us_il: BIPA — voiceprint is biometric; specific written consent,
 *     retention policy, statutory damages up to $5,000 per violation.
 *   - us_wa: RCW 9.73 two-party consent.
 *   - us_fl: Florida Sec. 934.03 two-party consent.
 *   - us_tx: Texas Penal Code §16.02 — one-party consent (default-ish),
 *     but Texas Captioning + DSHS rules add specifics for healthcare.
 *   - us_ma / us_mt / us_nh / us_pa / us_md: two-party consent regimes.
 *   - default: one-party-consent baseline (most US states + many others).
 *   - pdpa_tw: Taiwan PDPA Art. 7 — written consent for sensitive
 *     categories; voiceprint considered sensitive personal data.
 *   - gdpr_eu: GDPR Art. 6(1)(a) + Recital 32 — unambiguous, specific
 *     consent for voice biometrics under Art. 9(2)(a) if biometric.
 */

export const CONSENT_TEXT_VERSION = "v0-provisional-2026-05";
export const ATTORNEY_REVIEWED = false;

export type RecordingJurisdiction =
  | "us_ca"
  | "us_il"
  | "us_wa"
  | "us_fl"
  | "us_tx"
  | "us_ma"
  | "us_mt"
  | "us_nh"
  | "us_pa"
  | "us_md"
  | "default"
  | "pdpa_tw"
  | "gdpr_eu";

export type ConsentClass =
  | "staff_dictation"
  | "resident_speaking"
  | "family_about_resident";

export type RecordingConsentLocale = "en" | "zh-TW";

export interface RecordingConsentTextParams {
  /** Organization legal name as it should appear in the consent. */
  orgName: string;
  /** Email for data-subject requests / DPO contact. */
  dpoEmail: string;
  /** Resident first + last name interpolated into the consent. */
  residentName: string;
}

export const JURISDICTION_LABELS: Record<RecordingJurisdiction, string> = {
  us_ca: "California (CIPA — two-party consent)",
  us_il: "Illinois (BIPA — biometric, two-party consent)",
  us_wa: "Washington (RCW 9.73 — two-party consent)",
  us_fl: "Florida (Sec. 934.03 — two-party consent)",
  us_tx: "Texas (Penal Code §16.02)",
  us_ma: "Massachusetts (two-party consent)",
  us_mt: "Montana (two-party consent)",
  us_nh: "New Hampshire (two-party consent)",
  us_pa: "Pennsylvania (two-party consent)",
  us_md: "Maryland (two-party consent)",
  default: "Default (one-party-consent baseline)",
  pdpa_tw: "Taiwan (PDPA Art. 7)",
  gdpr_eu: "European Union (GDPR Art. 9(2)(a))",
};

export const CONSENT_CLASS_LABELS: Record<ConsentClass, string> = {
  staff_dictation: "Staff dictation (caregiver / admin / clinician records)",
  resident_speaking: "Resident speaking (resident's own voice captured)",
  family_about_resident:
    "Family observations (family records on behalf of resident)",
};

/**
 * Locales available per jurisdiction. We provide zh-TW for pdpa_tw and
 * en for everything else; mixed-language facilities should capture the
 * locale the consenting party reads. id / vi / tl translations are
 * pending a certified medical translator engagement (see PDPA copy).
 */
export function localesForJurisdiction(
  jurisdiction: RecordingJurisdiction
): RecordingConsentLocale[] {
  if (jurisdiction === "pdpa_tw") return ["zh-TW", "en"];
  return ["en"];
}

const CLASS_PURPOSE_EN: Record<ConsentClass, string> = {
  staff_dictation:
    "Care staff (caregivers, administrators, and treating clinicians) will record their own spoken observations about the Resident. The recording captures the staff member's voice, and may incidentally capture the Resident's voice or the voices of others present in the care environment.",
  resident_speaking:
    "The Resident's own voice will be recorded as part of their care record — for example, when the Resident participates in a voice-based check-in or speaks during a dictation.",
  family_about_resident:
    "Family members of the Resident will record their own spoken observations and updates regarding the Resident. The recording captures the family member's voice and may incidentally capture the voices of others present.",
};

const CLASS_PURPOSE_ZH: Record<ConsentClass, string> = {
  staff_dictation:
    "本機構之照護人員（含照顧服務員、管理人員及合作之臨床人員）將以語音方式記錄其對住民之觀察。錄音將擷取該員之聲音，並可能附帶擷取住民或當場其他人員之聲音。",
  resident_speaking:
    "住民本人之聲音將作為照護紀錄之一部分予以錄音，例如住民參與語音互動或進行口述時。",
  family_about_resident:
    "住民之家屬將以語音方式記錄其對住民之觀察與更新。錄音將擷取該家屬之聲音，並可能附帶擷取當場其他人員之聲音。",
};

function jurisdictionPreambleEn(j: RecordingJurisdiction): string {
  switch (j) {
    case "us_ca":
      return "Under California's Invasion of Privacy Act (Penal Code §§ 630–638), all parties whose voices may be recorded in a confidential communication must consent before recording begins. This document captures that consent.";
    case "us_il":
      return "Under the Illinois Biometric Information Privacy Act (740 ILCS 14/), a voiceprint is a biometric identifier. The Organization is providing this written notice and obtaining written consent before collecting, storing, or processing your voiceprint or voice recordings.";
    case "us_wa":
      return "Under Washington's privacy act (RCW 9.73), all parties to a private communication must consent before it may be recorded. This document captures that consent.";
    case "us_fl":
      return "Under Florida Statute §934.03, all parties to a communication must consent to recording. This document captures that consent.";
    case "us_tx":
      return "Although Texas Penal Code §16.02 requires only one-party consent, this Organization captures all-party consent for healthcare voice recordings as a matter of practice and to satisfy DSHS care-record standards.";
    case "us_ma":
    case "us_mt":
    case "us_nh":
    case "us_pa":
    case "us_md":
      return "This jurisdiction requires all parties to a communication to consent before it may be recorded. This document captures that consent.";
    case "default":
      return "This consent is captured as a matter of organizational policy, even where local law would not strictly require it, to ensure that any party whose voice is recorded has been informed and has agreed.";
    case "pdpa_tw":
      return "Under Taiwan's Personal Data Protection Act, written consent is required before processing sensitive personal data, including voiceprints. This document captures that written consent.";
    case "gdpr_eu":
      return "Under the EU General Data Protection Regulation (Art. 6(1)(a), with Art. 9(2)(a) applying where the recording constitutes biometric processing), the Organization must obtain specific, unambiguous, informed consent. This document captures that consent.";
  }
}

function jurisdictionPreambleZh(j: RecordingJurisdiction): string {
  if (j === "pdpa_tw") {
    return "依據中華民國個人資料保護法第七條規定，蒐集、處理或利用敏感個人資料（包含聲紋資料）應取得當事人之書面同意。本同意書即為該書面同意之依據。";
  }
  return jurisdictionPreambleEn(j);
}

function rightsEn(j: RecordingJurisdiction): string {
  const lines = [
    "You have the right to refuse to consent. Refusal will not affect the Resident's eligibility for care, but may limit the Organization's ability to use voice-based tools for documentation.",
    "You may withdraw this consent at any time by notifying the Organization. Withdrawal stops new recordings immediately. Withdrawal does not invalidate processing that occurred lawfully before withdrawal.",
    "Audio recordings are NOT retained: voice is transcribed and the transcript becomes part of the care record; the original audio file is deleted within minutes of transcription.",
    "Transcripts are retained for the duration of the care relationship plus any statutory retention period applicable in your jurisdiction.",
    "You may request access to, correction of, or deletion of recorded transcripts at any time.",
  ];
  if (j === "us_il") {
    lines.push(
      "Under BIPA, the Organization will not sell, lease, trade, or otherwise profit from your voiceprint, and will destroy any biometric identifiers within the timeframe required by 740 ILCS 14/15(a)."
    );
  }
  if (j === "gdpr_eu") {
    lines.push(
      "You have the rights of access, rectification, erasure, restriction of processing, data portability, and to lodge a complaint with a supervisory authority."
    );
  }
  return lines.map((l, i) => `   ${i + 1}. ${l}`).join("\n");
}

function rightsZh(): string {
  const lines = [
    "您有權拒絕同意。拒絕不影響住民接受照護之資格，但可能限制本機構運用語音工具進行紀錄之能力。",
    "您得隨時通知本機構撤回本同意。撤回後本機構即刻停止新增錄音。撤回不影響撤回前已合法進行之處理。",
    "本機構不保留原始語音檔：聲音經轉錄為文字後成為照護紀錄之一部分；原始音檔將於轉錄完成數分鐘內刪除。",
    "轉錄文字將於照護關係存續期間及法定保存期間內留存。",
    "您得隨時就所留存之轉錄文字請求查詢、更正或刪除。",
  ];
  return lines.map((l, i) => `   ${i + 1}. ${l}`).join("\n");
}

function renderEn(
  jurisdiction: RecordingJurisdiction,
  consentClass: ConsentClass,
  params: RecordingConsentTextParams
): string {
  return `[Voice Recording Consent — ${JURISDICTION_LABELS[jurisdiction]} — Provisional ${CONSENT_TEXT_VERSION}]

This consent has not yet been reviewed by a licensed attorney. It is a
provisional template for system testing. The final, jurisdiction-specific
version will be provided after review by qualified counsel.

1. Organization
${params.orgName} ("the Organization")

2. Resident
${params.residentName} ("the Resident")

3. Jurisdictional Basis
${jurisdictionPreambleEn(jurisdiction)}

4. What Is Being Consented To
${CLASS_PURPOSE_EN[consentClass]}

The recording will be transcribed by an automated voice-to-text service
(OpenAI Whisper or Deepgram). The transcript becomes part of the
Resident's care record and may be processed by AI services (Anthropic
Claude) to produce structured summaries that care staff, treating
clinicians, and (where separately authorized) family members may read.

5. Original Audio Is Not Retained
Original audio recordings are deleted within minutes of transcription.
Only the transcribed text is retained.

6. Your Rights
${rightsEn(jurisdiction)}

7. How to Withdraw
Email the Organization's data protection contact: ${params.dpoEmail}
Or notify any administrator at the Organization in writing.

8. Effective Date
This consent is effective from the date of signature below until
withdrawn or until the Resident's care relationship with the
Organization ends.

—

I have read and understood the above and consent to ${params.orgName}
recording, transcribing, and processing voice for the purpose described
in Section 4, with respect to ${params.residentName}.`;
}

function renderZh(
  jurisdiction: RecordingJurisdiction,
  consentClass: ConsentClass,
  params: RecordingConsentTextParams
): string {
  return `【語音錄音同意書 — ${JURISDICTION_LABELS[jurisdiction]} — 暫行版本 ${CONSENT_TEXT_VERSION}】

本同意書尚未經律師審閱，為系統測試用途之暫行版本。
正式版本將由具備管轄資格之律師審閱後提供。

一、本機構
${params.orgName}（以下稱「本機構」）

二、住民
${params.residentName}（以下稱「住民」）

三、法定依據
${jurisdictionPreambleZh(jurisdiction)}

四、同意之範圍
${CLASS_PURPOSE_ZH[consentClass]}

錄音將透過自動化語音轉錄服務（OpenAI Whisper 或 Deepgram）轉成文字。
轉錄文字將成為住民照護紀錄之一部分，並可能由人工智慧服務（Anthropic
Claude）處理，以產生供照護人員、合作之臨床人員及（經另行授權之）
家屬閱覽之結構化摘要。

五、原始音檔不予保留
原始錄音檔將於轉錄完成後數分鐘內刪除，僅保留轉錄後之文字。

六、您之權利
${rightsZh()}

七、撤回同意之方式
請以電子郵件通知本機構資料保護聯絡人：${params.dpoEmail}
亦可以書面方式通知本機構任何管理人員。

八、生效期間
本同意書自簽署之日起生效，至撤回同意或住民與本機構之照護關係
終止之日止。

—

本人已詳讀並了解上述內容，同意 ${params.orgName} 依第四項所載
之目的，就 ${params.residentName} 進行語音錄音、轉錄及處理。`;
}

/**
 * Render the consent text for a (jurisdiction, class, locale) tuple.
 * Returns the exact string that should be displayed to the consenting
 * party AND stored verbatim in `consent_text_snapshot` on the resulting
 * consent record.
 */
export function renderRecordingConsentText(
  jurisdiction: RecordingJurisdiction,
  consentClass: ConsentClass,
  locale: RecordingConsentLocale,
  params: RecordingConsentTextParams
): string {
  if (locale === "zh-TW") {
    return renderZh(jurisdiction, consentClass, params);
  }
  return renderEn(jurisdiction, consentClass, params);
}
