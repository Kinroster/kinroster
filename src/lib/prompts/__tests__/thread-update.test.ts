import { describe, it, expect } from "vitest";
import {
  THREAD_UPDATE_SYSTEM_PROMPT,
  THREAD_UPDATE_PROMPT_VERSION,
  EMPTY_THREAD_BODY,
  approximateTokens,
  buildThreadUpdatePromptParts,
  isThreadBodyShape,
  threadBodyOrEmpty,
} from "@/lib/prompts/thread-update";

describe("THREAD_UPDATE_SYSTEM_PROMPT", () => {
  it("enforces key invariants in plain English", () => {
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("Carry forward EVERYTHING");
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("NEVER invent facts");
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("family_safe_summary");
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("clinician_clinical_summary");
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("REPORTED");
  });

  it("instructs promoting unresolved/recurring/worsening issues into active_concerns", () => {
    // Rule 12 (concern-promotion-v1): the fix for active_concerns staying empty
    // while the narrative described ongoing issues.
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain(
      "Maintain active_concerns as the resident's OPEN-issue list"
    );
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("recurring across shifts, or worsening");
    // Must stay grounded — promotion is surfacing, not inference.
    expect(THREAD_UPDATE_SYSTEM_PROMPT).toContain("rule 3 still holds");
  });

  it("pins the prompt version to the spec", () => {
    expect(THREAD_UPDATE_PROMPT_VERSION).toBe("2026-06-08-concern-promotion-v1");
  });
});

describe("isThreadBodyShape", () => {
  it("accepts the EMPTY_THREAD_BODY constant", () => {
    expect(isThreadBodyShape(EMPTY_THREAD_BODY)).toBe(true);
  });

  it("rejects unrelated shapes", () => {
    expect(isThreadBodyShape(null)).toBe(false);
    expect(isThreadBodyShape("text")).toBe(false);
    expect(isThreadBodyShape({})).toBe(false);
    expect(isThreadBodyShape({ narrative: "x" })).toBe(false);
  });

  it("accepts a body missing optional fields if top-level shape is present", () => {
    expect(
      isThreadBodyShape({
        narrative: "ok",
        active_concerns: [],
        baselines: {},
        recent_incidents: [],
        follow_ups_open: [],
        open_questions: [],
        family_safe_summary: "",
        clinician_clinical_summary: "",
        notes_consumed_count: 0,
      })
    ).toBe(true);
  });
});

describe("threadBodyOrEmpty", () => {
  it("returns EMPTY on null/garbage", () => {
    expect(threadBodyOrEmpty(null)).toEqual(EMPTY_THREAD_BODY);
    expect(threadBodyOrEmpty(undefined)).toEqual(EMPTY_THREAD_BODY);
    expect(threadBodyOrEmpty({ foo: "bar" } as never)).toEqual(
      EMPTY_THREAD_BODY
    );
  });

  it("passes through a valid body", () => {
    const valid = {
      ...EMPTY_THREAD_BODY,
      narrative: "Maria has been sleeping well.",
    };
    expect(threadBodyOrEmpty(valid as never)).toEqual(valid);
  });
});

describe("approximateTokens", () => {
  it("returns a positive integer roughly proportional to body size", () => {
    const small = approximateTokens(EMPTY_THREAD_BODY);
    const big = approximateTokens({
      ...EMPTY_THREAD_BODY,
      narrative: "a".repeat(2000),
    });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
  });
});

describe("buildThreadUpdatePromptParts", () => {
  it("splits into static + prior-thread + volatile blocks", () => {
    const parts = buildThreadUpdatePromptParts({
      residentFirstName: "Maria",
      residentLastName: "Lopez",
      conditions: "Diabetes type 2",
      careNotesContext: "Prefers morning walks",
      priorBody: EMPTY_THREAD_BODY,
      newNoteStructured: { summary: "Calm morning." },
      newNoteRawExcerpt: "Maria was calm this morning.",
      newNoteCreatedAt: "2026-05-22T08:00:00Z",
      newNoteAuthorName: "James",
      newNoteAuthorType: "caregiver",
    });

    expect(parts.residentStaticBlock).toContain("Maria Lopez");
    expect(parts.residentStaticBlock).toContain("Diabetes type 2");
    expect(parts.residentStaticBlock).toContain("Prefers morning walks");

    expect(parts.priorThreadBlock).toContain("Prior thread body");
    expect(parts.priorThreadBlock).toContain("schema_version");

    expect(parts.volatileTail).toContain("James");
    expect(parts.volatileTail).toContain("caregiver");
    expect(parts.volatileTail).toContain("Calm morning");
    expect(parts.volatileTail).toContain("Maria was calm this morning.");
  });

  it("truncates raw input to 500 chars", () => {
    const longRaw = "x".repeat(600);
    const parts = buildThreadUpdatePromptParts({
      residentFirstName: "A",
      residentLastName: "B",
      conditions: null,
      careNotesContext: null,
      priorBody: EMPTY_THREAD_BODY,
      newNoteStructured: {},
      newNoteRawExcerpt: longRaw,
      newNoteCreatedAt: "2026-05-22T08:00:00Z",
      newNoteAuthorName: "Author",
      newNoteAuthorType: "caregiver",
    });
    expect(parts.volatileTail).toContain("truncated to 500 chars");
    expect(parts.volatileTail).toContain("x".repeat(500));
    expect(parts.volatileTail).not.toContain("x".repeat(501));
  });
});
