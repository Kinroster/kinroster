import { describe, it, expect } from "vitest";
import {
  isRecordingJurisdiction,
  resolveExpectedJurisdiction,
} from "@/lib/recording-consent/active-consent";

describe("resolveExpectedJurisdiction", () => {
  it("returns explicit settings override when set and valid", () => {
    expect(
      resolveExpectedJurisdiction("hipaa_us", {
        voice_recording_jurisdiction: "us_ca",
      })
    ).toBe("us_ca");
    expect(
      resolveExpectedJurisdiction("hipaa_us", {
        voice_recording_jurisdiction: "us_il",
      })
    ).toBe("us_il");
  });

  it("ignores invalid override values and falls back to region", () => {
    expect(
      resolveExpectedJurisdiction("hipaa_us", {
        voice_recording_jurisdiction: "atlantis",
      })
    ).toBe("default");
    expect(
      resolveExpectedJurisdiction("pdpa_tw", {
        voice_recording_jurisdiction: 42 as unknown as string,
      })
    ).toBe("pdpa_tw");
  });

  it("maps regions to defaults when no override", () => {
    expect(resolveExpectedJurisdiction("hipaa_us", null)).toBe("default");
    expect(resolveExpectedJurisdiction("hipaa_us", {})).toBe("default");
    expect(resolveExpectedJurisdiction("pdpa_tw", null)).toBe("pdpa_tw");
    expect(resolveExpectedJurisdiction("gdpr_eu", null)).toBe("gdpr_eu");
  });
});

describe("isRecordingJurisdiction", () => {
  it("accepts known jurisdictions", () => {
    expect(isRecordingJurisdiction("us_ca")).toBe(true);
    expect(isRecordingJurisdiction("default")).toBe(true);
    expect(isRecordingJurisdiction("pdpa_tw")).toBe(true);
    expect(isRecordingJurisdiction("gdpr_eu")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isRecordingJurisdiction("us_xx")).toBe(false);
    expect(isRecordingJurisdiction("")).toBe(false);
    expect(isRecordingJurisdiction("hipaa_us")).toBe(false);
  });
});
