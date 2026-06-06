// Runs a single eval case end-to-end through the REAL prod path:
//   buildUserPrompt -> callClaude -> parseJsonResponse -> graders
// No database, no mocks. The model call gets one transient-error retry (live
// nightly runs see the occasional 429/5xx/timeout and a single blip shouldn't
// flip the whole run red). A failed call or unparseable response is recorded
// as a hard schema failure so it surfaces in the scorecard rather than
// throwing and aborting the run.

import { callClaude, parseJsonResponse } from '@/lib/claude';
import { REGISTRY } from './registry';
import type { CaseRun, EvalCase, Grader, GraderResult, PromptId } from './types';
import { schemaGrader } from '../graders/schema';
import { diagnosisGrader } from '../graders/diagnosis';
import { leakageGrader } from '../graders/leakage';
import { sensitiveGrader } from '../graders/sensitive';
import { flagsGrader } from '../graders/flags';
import { classificationGrader } from '../graders/classification';
import { faithfulnessGrader, toneGrader } from '../graders/judge';
import { voiceSanityGrader } from '../graders/voice-sanity';

// Hard gates common to every structured prompt.
const BASE: Grader[] = [schemaGrader, leakageGrader];
// The synthesizing prompts (report + summaries) must stay factual and faithful.
const SYNTH: Grader[] = [...BASE, diagnosisGrader, faithfulnessGrader];

const GRADERS: Record<PromptId, Grader[]> = {
  'shift-note': [...BASE, diagnosisGrader, sensitiveGrader, flagsGrader, faithfulnessGrader],
  'incident-classify': [schemaGrader, diagnosisGrader, classificationGrader],
  // No faithfulness judge here: the regulatory incident-report TEMPLATE
  // legitimately DERIVES fields the source doesn't state (notifications_needed,
  // recommended follow-up, corrective actions), which an output⊆source judge
  // wrongly flags as fabrication. A narrative-only judge (description /
  // injuries / status fields) is the right tool — deferred to a later slice.
  'incident-report': [...BASE, diagnosisGrader],
  'clinician-summary': SYNTH,
  'family-update': [...SYNTH, toneGrader],
  'weekly-summary': SYNTH,
  'voice-sanity': [schemaGrader, voiceSanityGrader],
};

async function callWithRetry(
  entry: (typeof REGISTRY)[PromptId],
  userPrompt: string
): Promise<string> {
  try {
    return await callClaude({
      systemPrompt: entry.systemPrompt,
      userPrompt,
      model: entry.model,
      maxTokens: entry.maxTokens,
    });
  } catch {
    // One retry — callClaude already retries 5xx/timeout internally; this also
    // covers 429s and the rare second blip without failing the case.
    return callClaude({
      systemPrompt: entry.systemPrompt,
      userPrompt,
      model: entry.model,
      maxTokens: entry.maxTokens,
    });
  }
}

export async function runCase(caseDef: EvalCase): Promise<CaseRun> {
  const entry = REGISTRY[caseDef.prompt];
  let rawOutput: string;

  try {
    rawOutput = await callWithRetry(entry, entry.buildUserPrompt(caseDef.input));
  } catch (err) {
    return {
      caseId: caseDef.id,
      prompt: caseDef.prompt,
      lang: caseDef.lang,
      ok: false,
      results: [apiFailure(caseDef, `API call failed: ${(err as Error).message}`)],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseJsonResponse(rawOutput);
  } catch (err) {
    return {
      caseId: caseDef.id,
      prompt: caseDef.prompt,
      lang: caseDef.lang,
      ok: false,
      rawOutput,
      results: [apiFailure(caseDef, `JSON parse failed: ${(err as Error).message}`)],
    };
  }

  const ctx = { caseDef, rawOutput, parsed };
  // Graders may be sync (deterministic) or async (the LLM-as-judge); await all.
  const results = await Promise.all(GRADERS[caseDef.prompt].map((g) => g(ctx)));

  return {
    caseId: caseDef.id,
    prompt: caseDef.prompt,
    lang: caseDef.lang,
    ok: true,
    rawOutput,
    parsed,
    results,
  };
}

function apiFailure(caseDef: EvalCase, detail: string): GraderResult {
  return {
    grader: 'schema',
    caseId: caseDef.id,
    prompt: caseDef.prompt,
    gate: 'hard',
    applicable: true,
    pass: false,
    detail,
  };
}
