// Rate gate: LLM-as-judge faithfulness. The deterministic `diagnosis` grader is
// only a keyword tripwire; this is the real "scribe, never a clinician" check —
// it asks a separate Haiku call (temperature 0, schema-validated verdict)
// whether every claim in the output traces to the source the model was given.
//
// Applies only to cases that declare `expect.faithfulness`. SOURCE is rebuilt
// from the registry so the judge sees EXACTLY what the prompt was given (raw
// note + resident context + conditions); OUTPUT is the model's raw response.

import { callClaude, modelFor, parseJsonResponse } from '@/lib/claude';
import { REGISTRY } from '../runner/registry';
import {
  FAITHFULNESS_JUDGE_SYSTEM_PROMPT,
  buildFaithfulnessJudgeUserPrompt,
} from '../judge/faithfulness-prompt';
import { zJudgeVerdict } from '../judge/judge-schema';
import type { Grader } from '../runner/types';
import { result } from './util';

const DEFAULT_MIN_SCORE = 0.8;

export const faithfulnessGrader: Grader = async (ctx) => {
  const expectation = ctx.caseDef.expect.faithfulness;
  if (!expectation) {
    return result(ctx, 'faithfulness', 'rate', { applicable: false, pass: true });
  }
  const minScore = expectation.minScore ?? DEFAULT_MIN_SCORE;

  const entry = REGISTRY[ctx.caseDef.prompt];
  const source = entry.buildUserPrompt(ctx.caseDef.input);
  const userPrompt = buildFaithfulnessJudgeUserPrompt({
    source,
    output: ctx.rawOutput,
  });

  let verdictRaw: string;
  try {
    verdictRaw = await callClaude({
      systemPrompt: FAITHFULNESS_JUDGE_SYSTEM_PROMPT,
      userPrompt,
      model: modelFor('classify'),
      maxTokens: 600,
      temperature: 0,
    });
  } catch (err) {
    return result(ctx, 'faithfulness', 'rate', {
      applicable: true,
      pass: false,
      detail: `judge call failed: ${(err as Error).message}`,
    });
  }

  const parsed = zJudgeVerdict.safeParse(safeParseJson(verdictRaw));
  if (!parsed.success) {
    return result(ctx, 'faithfulness', 'rate', {
      applicable: true,
      pass: false,
      detail: `judge returned malformed verdict: ${parsed.error?.issues[0]?.message ?? 'unparseable'}`,
    });
  }

  const verdict = parsed.data;
  const pass = verdict.score >= minScore;
  return result(ctx, 'faithfulness', 'rate', {
    applicable: true,
    pass,
    score: verdict.score,
    detail: pass
      ? undefined
      : `score ${verdict.score.toFixed(2)} < ${minScore} — ${verdict.reasoning}${
          verdict.violations.length ? ` [${verdict.violations.join('; ')}]` : ''
        }`,
  });
};

function safeParseJson(raw: string): unknown {
  try {
    return parseJsonResponse(raw);
  } catch {
    return null;
  }
}
