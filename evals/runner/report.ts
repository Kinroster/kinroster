// Aggregates per-case grader results into a scorecard, prints a console table,
// and writes a JSON artifact to evals/.results/<iso-ts>.json. Hard gates must
// be 100%; rate gates must clear their threshold. The eval spec asserts on the
// returned scorecard.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CaseRun, Gate, PromptId } from './types';

const THRESHOLDS: Record<string, number> = {
  schema: 1,
  diagnosis: 1,
  leakage: 1,
  sensitive: 1,
  flags: 0.9,
  classification: 0.9,
  'voice-sanity': 0.9,
  faithfulness: 0.8,
  tone: 0.8,
};

export interface GateScore {
  prompt: PromptId;
  grader: string;
  gate: Gate;
  applicable: number;
  passed: number;
  rate: number; // 1 when applicable === 0 (vacuously satisfied)
  threshold: number;
  ok: boolean;
}

export interface Scorecard {
  gates: GateScore[];
  overallPass: boolean;
  totalCases: number;
  apiErrors: number;
}

export function buildScorecard(runs: CaseRun[]): Scorecard {
  const byKey = new Map<
    string,
    { prompt: PromptId; grader: string; gate: Gate; applicable: number; passed: number }
  >();

  for (const run of runs) {
    for (const r of run.results) {
      if (!r.applicable) continue;
      const key = `${r.prompt}::${r.grader}`;
      const agg = byKey.get(key) ?? {
        prompt: r.prompt,
        grader: r.grader,
        gate: r.gate,
        applicable: 0,
        passed: 0,
      };
      agg.applicable += 1;
      if (r.pass) agg.passed += 1;
      byKey.set(key, agg);
    }
  }

  const gates: GateScore[] = [...byKey.values()].map((a) => {
    const rate = a.applicable === 0 ? 1 : a.passed / a.applicable;
    const threshold = THRESHOLDS[a.grader] ?? 1;
    return {
      prompt: a.prompt,
      grader: a.grader,
      gate: a.gate,
      applicable: a.applicable,
      passed: a.passed,
      rate,
      threshold,
      ok: rate >= threshold,
    };
  });

  gates.sort((x, y) => x.prompt.localeCompare(y.prompt) || x.grader.localeCompare(y.grader));

  return {
    gates,
    overallPass: gates.every((g) => g.ok),
    totalCases: runs.length,
    apiErrors: runs.filter((r) => !r.ok).length,
  };
}

export function printScorecard(sc: Scorecard, runs: CaseRun[]): void {
  console.log('\n=== Eval Scorecard ===');
  console.log(`cases: ${sc.totalCases}  api-errors: ${sc.apiErrors}\n`);

  const rows = sc.gates.map((g) => ({
    prompt: g.prompt,
    grader: g.grader,
    gate: g.gate,
    result: `${g.passed}/${g.applicable}`,
    rate: `${Math.round(g.rate * 100)}%`,
    need: `${Math.round(g.threshold * 100)}%`,
    status: g.ok ? 'PASS' : 'FAIL',
  }));
  console.table(rows);

  const failures = runs.flatMap((r) =>
    r.results
      .filter((x) => x.applicable && !x.pass)
      .map((x) => `  ✗ [${x.prompt}] ${x.caseId} · ${x.grader}: ${x.detail ?? ''}`)
  );
  if (failures.length) {
    console.log('\nFailing cases:');
    console.log(failures.join('\n'));
  }
  console.log(`\nOVERALL: ${sc.overallPass ? 'PASS' : 'FAIL'}\n`);
}

export function writeReport(sc: Scorecard, runs: CaseRun[], timestamp: string): string {
  const dir = resolve(process.cwd(), 'evals/.results');
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${timestamp.replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        timestamp,
        scorecard: sc,
        cases: runs.map((r) => ({
          caseId: r.caseId,
          prompt: r.prompt,
          lang: r.lang,
          ok: r.ok,
          results: r.results,
          rawOutput: r.rawOutput,
        })),
      },
      null,
      2
    )
  );
  return file;
}
