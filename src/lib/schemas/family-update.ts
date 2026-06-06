// Shared Zod schema for the family-update output.

import { z } from 'zod';
import type { FamilyUpdateOutput } from '@/lib/prompts/family-update';
import type { AssertEqual } from '@/lib/schemas/_assert';

export const zFamilyUpdateOutput = z.object({
  subject: z.string(),
  body: z.string(),
});

export type FamilyUpdateOutputSchema = z.infer<typeof zFamilyUpdateOutput>;

export const _FAMILY_UPDATE_SCHEMA_MATCHES: AssertEqual<
  FamilyUpdateOutputSchema,
  FamilyUpdateOutput
> = true;
