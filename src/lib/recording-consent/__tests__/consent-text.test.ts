import { describe, it, expect } from "vitest";
import {
  CONSENT_TEXT_VERSION,
  ATTORNEY_REVIEWED,
  JURISDICTION_LABELS,
  CONSENT_CLASS_LABELS,
  localesForJurisdiction,
  renderRecordingConsentText,
  type RecordingJurisdiction,
} from "@/lib/recording-consent/consent-text";

const PARAMS = {
  orgName: "Sunrise Care",
  dpoEmail: "privacy@example.com",
  residentName: "Maria Lopez",
};

const ALL_JURISDICTIONS = Object.keys(
  JURISDICTION_LABELS
) as RecordingJurisdiction[];

describe("recording consent text", () => {
  it("flags provisional text version", () => {
    expect(ATTORNEY_REVIEWED).toBe(false);
    expect(CONSENT_TEXT_VERSION).toMatch(/v0-provisional/);
  });

  it("provides labels for every consent class", () => {
    expect(CONSENT_CLASS_LABELS.staff_dictation).toBeTruthy();
    expect(CONSENT_CLASS_LABELS.resident_speaking).toBeTruthy();
    expect(CONSENT_CLASS_LABELS.family_about_resident).toBeTruthy();
  });

  it("provides at least one locale per jurisdiction", () => {
    for (const j of ALL_JURISDICTIONS) {
      expect(localesForJurisdiction(j).length).toBeGreaterThan(0);
    }
  });

  it("offers zh-TW only for pdpa_tw", () => {
    expect(localesForJurisdiction("pdpa_tw")).toContain("zh-TW");
    expect(localesForJurisdiction("us_ca")).not.toContain("zh-TW");
  });

  it("renders English text with all interpolated params for every jurisdiction", () => {
    for (const j of ALL_JURISDICTIONS) {
      const out = renderRecordingConsentText(j, "staff_dictation", "en", PARAMS);
      expect(out).toContain("Sunrise Care");
      expect(out).toContain("Maria Lopez");
      expect(out).toContain("privacy@example.com");
      expect(out).toContain(JURISDICTION_LABELS[j]);
      expect(out).toContain(CONSENT_TEXT_VERSION);
    }
  });

  it("renders zh-TW text for pdpa_tw with interpolated params", () => {
    const out = renderRecordingConsentText(
      "pdpa_tw",
      "resident_speaking",
      "zh-TW",
      PARAMS
    );
    expect(out).toContain("Sunrise Care");
    expect(out).toContain("Maria Lopez");
    expect(out).toContain("privacy@example.com");
    expect(out).toContain("個人資料保護法");
  });

  it("varies copy by consent_class", () => {
    const staff = renderRecordingConsentText(
      "us_ca",
      "staff_dictation",
      "en",
      PARAMS
    );
    const resident = renderRecordingConsentText(
      "us_ca",
      "resident_speaking",
      "en",
      PARAMS
    );
    const family = renderRecordingConsentText(
      "us_ca",
      "family_about_resident",
      "en",
      PARAMS
    );
    expect(staff).not.toBe(resident);
    expect(staff).not.toBe(family);
    expect(resident).not.toBe(family);
  });

  it("includes BIPA-specific language for Illinois", () => {
    const out = renderRecordingConsentText(
      "us_il",
      "staff_dictation",
      "en",
      PARAMS
    );
    expect(out).toContain("BIPA");
    expect(out).toContain("biometric");
  });

  it("includes CIPA-specific language for California", () => {
    const out = renderRecordingConsentText(
      "us_ca",
      "staff_dictation",
      "en",
      PARAMS
    );
    expect(out).toContain("CIPA");
  });
});
