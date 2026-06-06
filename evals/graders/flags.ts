// Rate gate (shift-note only): flag accuracy. Covers testing-matrix criterion
// #6 (flags trigger for >=90% of real incidents). A case passes when every
// expected flag type is present and no forbidden flag type appears; the
// aggregate pass-rate across applicable cases must clear the 0.90 threshold.

import type { Grader } from '../runner/types';
import { outputFlagTypes, result } from './util';

export const flagsGrader: Grader = (ctx) => {
  const { expectedFlags, forbiddenFlags } = ctx.caseDef.expect;
  const checksExpected = expectedFlags !== undefined;
  const checksForbidden = forbiddenFlags !== undefined && forbiddenFlags.length > 0;
  if (!checksExpected && !checksForbidden) {
    return result(ctx, 'flags', 'rate', { applicable: false, pass: true });
  }

  const present = outputFlagTypes(ctx.parsed);
  const missing = (expectedFlags ?? []).filter((f) => !present.includes(f));
  const leaked = (forbiddenFlags ?? []).filter((f) => present.includes(f));

  const expectedCount = expectedFlags?.length ?? 0;
  const matched = expectedCount - missing.length;
  const score = expectedCount > 0 ? matched / expectedCount : leaked.length === 0 ? 1 : 0;

  const pass = missing.length === 0 && leaked.length === 0;
  const detailParts: string[] = [];
  if (missing.length) detailParts.push(`missing: ${missing.join(', ')}`);
  if (leaked.length) detailParts.push(`unexpected: ${leaked.join(', ')}`);

  return result(ctx, 'flags', 'rate', {
    applicable: true,
    pass,
    score,
    detail: detailParts.length
      ? `${detailParts.join('; ')} (present: ${present.join(', ') || 'none'})`
      : undefined,
  });
};
