// Shared Zod schema for the shift-note structuring output. Single source of
// truth for the output SHAPE: reused by the eval harness (evals/) and
// available for runtime validation in a later phase (parseJsonResponse(raw,
// schema)). Enum membership reuses the constants exported from the prompt
// module so there is exactly one place each enum is defined.

import { z } from 'zod';
import {
  DISCLOSURE_CLASSES,
  SCOPE_CATEGORIES,
  SENSITIVE_CATEGORIES,
  type StructuredNoteOutput,
} from '@/lib/prompts/shift-note';
import type { AssertEqual } from '@/lib/schemas/_assert';

export const zStructuredNoteSection = z.object({
  name: z.string(),
  text: z.string(),
  disclosure_class: z.enum(DISCLOSURE_CLASSES),
  scope_category: z.enum(SCOPE_CATEGORIES).nullable(),
});

export const zShiftNoteFlag = z.object({
  type: z.string(),
  reason: z.string(),
});

export const zShiftNoteOutput = z.object({
  summary: z.string(),
  sections: z.array(zStructuredNoteSection),
  follow_up: z.string(),
  flags: z.array(zShiftNoteFlag),
  sensitive_flag: z.boolean(),
  sensitive_category: z.enum(SENSITIVE_CATEGORIES).nullable(),
});

export type ShiftNoteOutput = z.infer<typeof zShiftNoteOutput>;

// Drift guard — see _assert.ts. Fails `tsc` if the schema and the interface
// diverge in either direction.
export const _SHIFT_NOTE_SCHEMA_MATCHES: AssertEqual<ShiftNoteOutput, StructuredNoteOutput> = true;
