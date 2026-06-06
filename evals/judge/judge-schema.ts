// Zod schema for the LLM-as-judge JSON verdict. The judge's own output is
// validated through parseJsonResponse + this schema, so a malformed verdict
// fails loudly rather than silently scoring 0/pass.

import { z } from 'zod';

export const zJudgeVerdict = z.object({
  // The judge's holistic call. The grader uses `score` against a threshold;
  // `pass` and `reasoning` are surfaced in the scorecard detail.
  pass: z.boolean(),
  score: z.number().min(0).max(1),
  reasoning: z.string(),
  // Concrete spans the judge flagged (e.g. an unsupported claim). May be empty.
  violations: z.array(z.string()).default([]),
});

export type JudgeVerdict = z.infer<typeof zJudgeVerdict>;
