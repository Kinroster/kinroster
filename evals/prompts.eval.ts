// Live eval spec for all 7 Claude prompts. Runs every case in tests/prompts/
// against the real Claude API, then asserts per-case hard gates and aggregate
// rate thresholds.
//
// Skips itself (exit 0) when ANTHROPIC_API_KEY is absent, so keyless local
// runs and fork PRs don't error. This file lives outside src/ and matches
// *.eval.ts, so `pnpm test:unit` never picks it up — only `pnpm eval` does.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCases } from './runner/loader';
import { runCase } from './runner/run-case';
import { buildScorecard, printScorecard, writeReport, type Scorecard } from './runner/report';
import type { CaseRun } from './runner/types';

const hasKey = !!process.env.ANTHROPIC_API_KEY;
const cases = loadCases();
const runs: CaseRun[] = [];
let scorecard: Scorecard;

// Bounded concurrency — fast enough for ~50 cases without hammering rate
// limits. Each case may fan out to a judge call too, so keep this modest.
const CONCURRENCY = 4;

async function runPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

beforeAll(async () => {
  if (!hasKey) return;
  await runPool(cases, CONCURRENCY, async (c) => {
    runs.push(await runCase(c));
  });
  scorecard = buildScorecard(runs);
}, 1_200_000);

afterAll(() => {
  if (!hasKey || runs.length === 0) return;
  printScorecard(scorecard, runs);
  writeReport(scorecard, runs, new Date().toISOString());
});

describe.skipIf(!hasKey)('per-case hard gates', () => {
  for (const c of cases) {
    it(`[${c.prompt}] ${c.id} (${c.lang})`, () => {
      const run = runs.find((r) => r.caseId === c.id);
      expect(run, `no run recorded for ${c.id}`).toBeDefined();
      const hardFailures = run!.results.filter((r) => r.applicable && r.gate === 'hard' && !r.pass);
      expect(
        hardFailures,
        hardFailures.map((f) => `${f.grader}: ${f.detail}`).join(' | ')
      ).toHaveLength(0);
    });
  }
});

describe.skipIf(!hasKey)('aggregate thresholds', () => {
  it('every case produced a parseable response (no API errors)', () => {
    expect(scorecard.apiErrors, 'some cases failed the API call or JSON parse').toBe(0);
  });

  it('all rate gates clear their threshold', () => {
    const failing = scorecard.gates.filter((g) => g.gate === 'rate' && !g.ok);
    expect(
      failing,
      failing
        .map(
          (g) =>
            `${g.prompt}/${g.grader} ${Math.round(g.rate * 100)}% < ${Math.round(g.threshold * 100)}%`
        )
        .join(' | ')
    ).toHaveLength(0);
  });

  it('overall scorecard passes', () => {
    expect(scorecard.overallPass).toBe(true);
  });
});
