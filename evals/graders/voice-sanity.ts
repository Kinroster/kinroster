// Rate gate (voice-sanity only): the over-capture classifier must call
// has_concerns correctly and, when the case lists expectedCategories, surface
// those categories. Applies only to cases that declare an expectation.

import type { Grader } from '../runner/types';
import { result } from './util';

export const voiceSanityGrader: Grader = (ctx) => {
  const { expectedHasConcerns, expectedCategories } = ctx.caseDef.expect;
  const checksConcerns = expectedHasConcerns !== undefined;
  const checksCategories = expectedCategories !== undefined && expectedCategories.length > 0;
  if (!checksConcerns && !checksCategories) {
    return result(ctx, 'voice-sanity', 'rate', { applicable: false, pass: true });
  }

  const obj = ctx.parsed as { has_concerns?: unknown; categories?: unknown };
  const detail: string[] = [];

  if (checksConcerns && obj.has_concerns !== expectedHasConcerns) {
    detail.push(
      `has_concerns=${String(obj.has_concerns)}, expected ${String(expectedHasConcerns)}`
    );
  }

  if (checksCategories) {
    const present = Array.isArray(obj.categories)
      ? obj.categories.filter((c): c is string => typeof c === 'string')
      : [];
    const missing = (expectedCategories ?? []).filter((c) => !present.includes(c));
    if (missing.length) detail.push(`missing categories: ${missing.join(', ')}`);
  }

  const pass = detail.length === 0;
  return result(ctx, 'voice-sanity', 'rate', {
    applicable: true,
    pass,
    score: pass ? 1 : 0,
    detail: pass ? undefined : detail.join('; '),
  });
};
