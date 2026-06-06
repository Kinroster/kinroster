// Shared Zod schema for the voice-sanity (over-capture) output. See
// src/lib/schemas/shift-note.ts for the single-source-of-truth rationale.

import { z } from 'zod';
import type { VoiceSanityOutput } from '@/lib/prompts/voice-sanity';
import type { AssertEqual } from '@/lib/schemas/_assert';

export const OVER_CAPTURE_CATEGORIES = [
  'financial',
  'unrelated_personal',
  'other_resident',
  'non_care_gossip',
] as const;

export const zVoiceSanityOutput = z.object({
  has_concerns: z.boolean(),
  categories: z.array(z.enum(OVER_CAPTURE_CATEGORIES)),
  excerpts: z.array(z.string()),
});

export type VoiceSanityOutputSchema = z.infer<typeof zVoiceSanityOutput>;

export const _VOICE_SANITY_SCHEMA_MATCHES: AssertEqual<VoiceSanityOutputSchema, VoiceSanityOutput> =
  true;
