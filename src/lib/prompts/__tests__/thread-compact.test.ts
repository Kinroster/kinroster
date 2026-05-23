import { describe, it, expect } from "vitest";
import {
  THREAD_COMPACT_SYSTEM_PROMPT,
  buildThreadCompactPromptParts,
} from "@/lib/prompts/thread-compact";

describe("THREAD_COMPACT_SYSTEM_PROMPT", () => {
  it("forbids inventing new clinical content", () => {
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain("NEVER add facts");
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain(
      "do NOT add new clinical content"
    );
  });

  it("specifies the per-bucket preservation rules", () => {
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain("Keep ALL active_concerns");
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain("Keep ALL baselines");
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain("Keep ALL follow_ups_open");
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain("older than 30 days");
    expect(THREAD_COMPACT_SYSTEM_PROMPT).toContain("≤200 words");
  });
});

describe("buildThreadCompactPromptParts", () => {
  it("splits into a static block and a volatile tail", () => {
    const parts = buildThreadCompactPromptParts({
      residentFirstName: "Maria",
      residentLastName: "Lopez",
      currentBody: { narrative: "long text", active_concerns: [] },
      todayIso: "2026-05-23",
    });
    expect(parts.residentStaticBlock).toContain("Maria Lopez");
    expect(parts.volatileTail).toContain("Today's date: 2026-05-23");
    expect(parts.volatileTail).toContain("long text");
  });
});
