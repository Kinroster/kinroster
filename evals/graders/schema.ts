// Hard gate: the model output must parse against the prompt's shared Zod
// schema. Covers testing-matrix criterion #3 (consistent JSON schema) and,
// because the schema's enums are built from the prod constants, also enforces
// valid disclosure_class / scope_category / sensitive_category values.

import type { Grader } from '../runner/types';
import { result, schemaFor } from './util';

export const schemaGrader: Grader = (ctx) => {
  const parsed = schemaFor(ctx.caseDef.prompt).safeParse(ctx.parsed);
  if (parsed.success) {
    return result(ctx, 'schema', 'hard', { applicable: true, pass: true });
  }
  const issue = parsed.error.issues[0];
  const detail = issue
    ? `${issue.path.join('.') || '<root>'}: ${issue.message}`
    : 'schema mismatch';
  return result(ctx, 'schema', 'hard', { applicable: true, pass: false, detail });
};
