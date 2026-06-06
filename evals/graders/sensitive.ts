// Hard gate (shift-note only): sensitive-content classification. When a case
// declares an expected sensitive_flag / sensitive_category (e.g. substance use
// → 42 CFR Part 2), the output must match — this is what drives downstream
// disclosure gating, so a miss is a safety failure, not a quality nit.

import type { Grader } from '../runner/types';
import { result } from './util';

export const sensitiveGrader: Grader = (ctx) => {
  const { expectedSensitiveFlag, expectedSensitiveCategory } = ctx.caseDef.expect;
  const checksFlag = expectedSensitiveFlag !== undefined;
  const checksCategory = expectedSensitiveCategory !== undefined;
  if (!checksFlag && !checksCategory) {
    return result(ctx, 'sensitive', 'hard', { applicable: false, pass: true });
  }

  const obj = ctx.parsed as {
    sensitive_flag?: unknown;
    sensitive_category?: unknown;
  };

  if (checksFlag && obj.sensitive_flag !== expectedSensitiveFlag) {
    return result(ctx, 'sensitive', 'hard', {
      applicable: true,
      pass: false,
      detail: `sensitive_flag=${String(obj.sensitive_flag)}, expected ${String(expectedSensitiveFlag)}`,
    });
  }
  if (checksCategory && (obj.sensitive_category ?? null) !== expectedSensitiveCategory) {
    return result(ctx, 'sensitive', 'hard', {
      applicable: true,
      pass: false,
      detail: `sensitive_category=${String(obj.sensitive_category)}, expected ${String(expectedSensitiveCategory)}`,
    });
  }
  return result(ctx, 'sensitive', 'hard', { applicable: true, pass: true });
};
