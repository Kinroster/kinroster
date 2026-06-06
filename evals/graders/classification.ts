// Rate gate (incident-classify only): the safety classification must match the
// expectation. Supports either an exact `expectedClassification` or a set of
// `allowedClassifications` (the prompt defaults to the higher tier when
// uncertain, so a near-fall may legitimately land POSSIBLE *or* DEFINITE).
// Aggregate accuracy must clear the 0.90 threshold.

import type { Classification, Grader } from '../runner/types';
import { result } from './util';

export const classificationGrader: Grader = (ctx) => {
  const { expectedClassification, allowedClassifications } = ctx.caseDef.expect;
  if (!expectedClassification && !allowedClassifications) {
    return result(ctx, 'classification', 'rate', { applicable: false, pass: true });
  }

  const actual = (ctx.parsed as { classification?: unknown })?.classification as
    | Classification
    | undefined;

  const allowed =
    allowedClassifications ?? (expectedClassification ? [expectedClassification] : []);
  const pass = actual !== undefined && allowed.includes(actual);

  return result(ctx, 'classification', 'rate', {
    applicable: true,
    pass,
    score: pass ? 1 : 0,
    detail: pass ? undefined : `got "${String(actual)}", expected one of [${allowed.join(', ')}]`,
  });
};
