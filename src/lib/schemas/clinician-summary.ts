// Shared Zod schema for the clinician-summary output.

import { z } from 'zod';
import type { ClinicianSummaryOutput } from '@/lib/prompts/clinician-summary';
import type { AssertEqual } from '@/lib/schemas/_assert';

// The prompt instructs the model to "Leave a field null if nothing in the notes
// applies", so the list fields legitimately arrive as null (the prod clinician
// route already defends against this). Accept null and normalize to [] — the
// transform keeps the inferred type `string[]`, matching the interface and the
// drift guard.
const listOrNull = z
  .array(z.string())
  .nullable()
  .transform((v) => v ?? []);

export const zClinicianSummaryOutput = z.object({
  subject: z.string(),
  body: z.string(),
  key_observations: listOrNull,
  medication_adherence: z.string().nullable(),
  safety_events: listOrNull,
  cognitive_changes: z.string().nullable(),
  follow_up_recommended: listOrNull,
});

export type ClinicianSummaryOutputSchema = z.infer<typeof zClinicianSummaryOutput>;

export const _CLINICIAN_SUMMARY_SCHEMA_MATCHES: AssertEqual<
  ClinicianSummaryOutputSchema,
  ClinicianSummaryOutput
> = true;
