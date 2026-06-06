// Shared Zod schema for the incident-classification output. See
// src/lib/schemas/shift-note.ts for the rationale (single source of truth,
// reused by evals + future runtime validation).

import { z } from 'zod';
import type { IncidentClassification } from '@/lib/prompts/incident-classify';
import type { AssertEqual } from '@/lib/schemas/_assert';

export const INCIDENT_CLASSIFICATIONS = [
  'ROUTINE',
  'POSSIBLE_INCIDENT',
  'DEFINITE_INCIDENT',
] as const;

export const zIncidentClassification = z.object({
  classification: z.enum(INCIDENT_CLASSIFICATIONS),
  reason: z.string(),
});

export type IncidentClassificationOutput = z.infer<typeof zIncidentClassification>;

// Drift guard — fails `tsc` if schema and interface diverge.
export const _INCIDENT_CLASSIFY_SCHEMA_MATCHES: AssertEqual<
  IncidentClassificationOutput,
  IncidentClassification
> = true;
