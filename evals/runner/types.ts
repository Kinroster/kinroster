// Core types shared across the eval harness.

export type PromptId = 'shift-note' | 'incident-classify';

export type Lang = 'en' | 'zh-TW' | 'vi' | 'id';

export type Classification = 'ROUTINE' | 'POSSIBLE_INCIDENT' | 'DEFINITE_INCIDENT';

/**
 * Per-case expectations. Everything is optional; absent fields make the
 * corresponding grader "not applicable" for that case (excluded from
 * aggregation). Expectations describe PROPERTIES of the output, never an
 * exact golden string — model output is nondeterministic.
 */
export interface CaseExpect {
  // Hard gates (must be 100% across applicable cases)
  schemaValid?: boolean; // default true
  mustNotContainDiagnosis?: boolean; // default true
  forbiddenNames?: string[]; // names that must NOT appear (cross-resident leak)
  forbiddenContent?: string[]; // tokens that must NOT appear (e.g. injected
  // diagnosis/treatment terms an adversarial input tried to plant)
  expectedSensitiveFlag?: boolean;
  expectedSensitiveCategory?: string | null;
  // Rate gates (aggregate threshold across applicable cases)
  expectedFlags?: string[]; // flag types that should be present (shift-note)
  forbiddenFlags?: string[]; // flag types that must be absent (shift-note)
  expectedClassification?: Classification; // exact (incident-classify)
  allowedClassifications?: Classification[]; // membership (incident-classify)
  // LLM-as-judge faithfulness check (Slice 2). Presence makes the judge grader
  // applicable; `minScore` overrides the default 0.8 per-case pass bar.
  faithfulness?: { minScore?: number };
}

export interface EvalCase {
  id: string;
  prompt: PromptId;
  lang: Lang;
  tags?: string[];
  /** Adapter-specific payload — shape matches the registry entry's builder. */
  input: Record<string, unknown>;
  expect: CaseExpect;
}

export type Gate = 'hard' | 'rate';

export interface GraderResult {
  grader: string;
  caseId: string;
  prompt: PromptId;
  gate: Gate;
  /** When false, this grader does not apply to the case and is ignored. */
  applicable: boolean;
  pass: boolean;
  /** 0..1 for rate graders; informational. */
  score?: number;
  detail?: string;
}

export interface CaseRun {
  caseId: string;
  prompt: PromptId;
  lang: Lang;
  /** False when the API call or JSON parse failed. */
  ok: boolean;
  rawOutput?: string;
  parsed?: unknown;
  results: GraderResult[];
}

export interface GraderContext {
  caseDef: EvalCase;
  rawOutput: string;
  parsed: unknown;
}

export type Grader = (ctx: GraderContext) => GraderResult | Promise<GraderResult>;
