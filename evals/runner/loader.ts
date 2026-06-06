// Loads and validates the JSON case files under tests/prompts/. Validation
// happens at load time so a malformed case fails fast with a clear file path
// instead of an opaque error mid-run.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { EvalCase, PromptId } from './types';

const DATASET_DIR = resolve(process.cwd(), 'tests/prompts');

const PROMPT_IDS = ['shift-note', 'incident-classify'] as const;
const CLASSIFICATIONS = ['ROUTINE', 'POSSIBLE_INCIDENT', 'DEFINITE_INCIDENT'] as const;

const zExpect = z
  .object({
    schemaValid: z.boolean().optional(),
    mustNotContainDiagnosis: z.boolean().optional(),
    forbiddenNames: z.array(z.string()).optional(),
    forbiddenContent: z.array(z.string()).optional(),
    expectedSensitiveFlag: z.boolean().optional(),
    expectedSensitiveCategory: z.string().nullable().optional(),
    expectedFlags: z.array(z.string()).optional(),
    forbiddenFlags: z.array(z.string()).optional(),
    expectedClassification: z.enum(CLASSIFICATIONS).optional(),
    allowedClassifications: z.array(z.enum(CLASSIFICATIONS)).optional(),
    faithfulness: z
      .object({ minScore: z.number().min(0).max(1).optional() })
      .strict()
      .optional(),
  })
  .strict();

const zCase = z
  .object({
    id: z.string().min(1),
    prompt: z.enum(PROMPT_IDS),
    lang: z.enum(['en', 'zh-TW', 'vi', 'id']),
    tags: z.array(z.string()).optional(),
    input: z.record(z.unknown()),
    expect: zExpect,
  })
  .strict();

function walkJson(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkJson(full));
    } else if (entry.endsWith('.json') && !entry.startsWith('_')) {
      out.push(full);
    }
  }
  return out;
}

/** Load every case, optionally filtered to a single prompt. */
export function loadCases(filter?: PromptId): EvalCase[] {
  const files = walkJson(DATASET_DIR);
  const cases: EvalCase[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`Invalid JSON in ${file}: ${(err as Error).message}`);
    }
    const parsed = zCase.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `Invalid eval case ${file}: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`
      );
    }
    if (seen.has(parsed.data.id)) {
      throw new Error(`Duplicate case id "${parsed.data.id}" (${file})`);
    }
    seen.add(parsed.data.id);
    cases.push(parsed.data);
  }

  cases.sort((a, b) => a.id.localeCompare(b.id));
  return filter ? cases.filter((c) => c.prompt === filter) : cases;
}
