// Shared grader helpers.

import { REGISTRY } from '../runner/registry';
import type { GraderContext, GraderResult } from '../runner/types';

/** Recursively collect every string value in a parsed JSON structure. */
export function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, acc);
  }
  return acc;
}

/** The concatenated text of every string field in the output. */
export function outputText(parsed: unknown): string {
  return collectStrings(parsed).join('\n');
}

export function result(
  ctx: GraderContext,
  grader: string,
  gate: GraderResult['gate'],
  fields: Pick<GraderResult, 'applicable' | 'pass'> &
    Partial<Pick<GraderResult, 'score' | 'detail'>>
): GraderResult {
  return {
    grader,
    caseId: ctx.caseDef.id,
    prompt: ctx.caseDef.prompt,
    gate,
    ...fields,
  };
}

/** The flag `type` strings present in a shift-note output (empty otherwise). */
export function outputFlagTypes(parsed: unknown): string[] {
  const flags = (parsed as { flags?: unknown })?.flags;
  if (!Array.isArray(flags)) return [];
  return flags
    .map((f) => (f as { type?: unknown })?.type)
    .filter((t): t is string => typeof t === 'string');
}

export function schemaFor(promptId: GraderContext['caseDef']['prompt']) {
  return REGISTRY[promptId].schema;
}
