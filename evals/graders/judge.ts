// Rate gates backed by an LLM-as-judge — the checks the deterministic graders
// can only approximate. Each runs a separate Haiku call (temperature 0,
// schema-validated verdict) and is gated on a per-case expectation:
//   - faithfulness: every claim in the output traces to the source the model
//     was given (no fabrication / invented diagnosis). SOURCE is rebuilt from
//     the registry so the judge sees EXACTLY what the prompt was given.
//   - tone: the family-update reads warm and plain, concerns stated calmly.

import { callClaude, modelFor, parseJsonResponse } from '@/lib/claude';
import { REGISTRY } from '../runner/registry';
import {
  FAITHFULNESS_JUDGE_SYSTEM_PROMPT,
  buildFaithfulnessJudgeUserPrompt,
} from '../judge/faithfulness-prompt';
import { TONE_JUDGE_SYSTEM_PROMPT, buildToneJudgeUserPrompt } from '../judge/tone-prompt';
import { zJudgeVerdict } from '../judge/judge-schema';
import type { GraderContext, GraderResult } from '../runner/types';
import { result } from './util';

const DEFAULT_MIN_SCORE = 0.8;

/** Run one judge call and turn its verdict into a rate GraderResult. */
async function runJudge(
  ctx: GraderContext,
  grader: string,
  minScore: number,
  systemPrompt: string,
  userPrompt: string
): Promise<GraderResult> {
  let verdictRaw: string;
  try {
    verdictRaw = await callClaude({
      systemPrompt,
      userPrompt,
      model: modelFor('classify'),
      maxTokens: 600,
      temperature: 0,
    });
  } catch (err) {
    return result(ctx, grader, 'rate', {
      applicable: true,
      pass: false,
      detail: `judge call failed: ${(err as Error).message}`,
    });
  }

  const parsed = zJudgeVerdict.safeParse(safeParseJson(verdictRaw));
  if (!parsed.success) {
    return result(ctx, grader, 'rate', {
      applicable: true,
      pass: false,
      detail: `judge returned malformed verdict: ${parsed.error?.issues[0]?.message ?? 'unparseable'}`,
    });
  }

  const verdict = parsed.data;
  const pass = verdict.score >= minScore;
  return result(ctx, grader, 'rate', {
    applicable: true,
    pass,
    score: verdict.score,
    detail: pass
      ? undefined
      : `score ${verdict.score.toFixed(2)} < ${minScore} — ${verdict.reasoning}${
          verdict.violations.length ? ` [${verdict.violations.join('; ')}]` : ''
        }`,
  });
}

export const faithfulnessGrader = async (ctx: GraderContext): Promise<GraderResult> => {
  const expectation = ctx.caseDef.expect.faithfulness;
  if (!expectation) {
    return result(ctx, 'faithfulness', 'rate', { applicable: false, pass: true });
  }
  const source = REGISTRY[ctx.caseDef.prompt].buildUserPrompt(ctx.caseDef.input);
  return runJudge(
    ctx,
    'faithfulness',
    expectation.minScore ?? DEFAULT_MIN_SCORE,
    FAITHFULNESS_JUDGE_SYSTEM_PROMPT,
    buildFaithfulnessJudgeUserPrompt({ source, output: ctx.rawOutput })
  );
};

export const toneGrader = async (ctx: GraderContext): Promise<GraderResult> => {
  const expectation = ctx.caseDef.expect.tone;
  if (!expectation) {
    return result(ctx, 'tone', 'rate', { applicable: false, pass: true });
  }
  // Judge the human-facing message body, not the JSON wrapper.
  const body = (ctx.parsed as { body?: unknown })?.body;
  const output = typeof body === 'string' ? body : ctx.rawOutput;
  return runJudge(
    ctx,
    'tone',
    expectation.minScore ?? DEFAULT_MIN_SCORE,
    TONE_JUDGE_SYSTEM_PROMPT,
    buildToneJudgeUserPrompt({ output })
  );
};

function safeParseJson(raw: string): unknown {
  try {
    return parseJsonResponse(raw);
  } catch {
    return null;
  }
}
