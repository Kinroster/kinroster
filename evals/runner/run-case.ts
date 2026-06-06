// Runs a single eval case end-to-end through the REAL prod path:
//   buildUserPrompt -> callClaude -> parseJsonResponse -> graders
// No database, no mocks. A failed API call or unparseable response is recorded
// as a hard schema failure so it surfaces in the scorecard rather than
// throwing and aborting the whole run.

import { callClaude, parseJsonResponse } from '@/lib/claude';
import { REGISTRY } from './registry';
import type { CaseRun, EvalCase, Grader, GraderResult } from './types';
import { schemaGrader } from '../graders/schema';
import { diagnosisGrader } from '../graders/diagnosis';
import { leakageGrader } from '../graders/leakage';
import { sensitiveGrader } from '../graders/sensitive';
import { flagsGrader } from '../graders/flags';
import { classificationGrader } from '../graders/classification';

const GRADERS: Record<EvalCase['prompt'], Grader[]> = {
  'shift-note': [schemaGrader, diagnosisGrader, leakageGrader, sensitiveGrader, flagsGrader],
  'incident-classify': [schemaGrader, diagnosisGrader, classificationGrader],
};

export async function runCase(caseDef: EvalCase): Promise<CaseRun> {
  const entry = REGISTRY[caseDef.prompt];
  let rawOutput: string;

  try {
    const userPrompt = entry.buildUserPrompt(caseDef.input);
    rawOutput = await callClaude({
      systemPrompt: entry.systemPrompt,
      userPrompt,
      model: entry.model,
      maxTokens: entry.maxTokens,
    });
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
  const results = GRADERS[caseDef.prompt].map((g) => g(ctx));

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
