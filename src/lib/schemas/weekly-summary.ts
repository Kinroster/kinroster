// Shared Zod schema for the weekly-summary output.

import { z } from 'zod';
import type { WeeklySummaryOutput } from '@/lib/prompts/weekly-summary';
import type { AssertEqual } from '@/lib/schemas/_assert';

export const zWeeklySummaryOutput = z.object({
  summary_text: z.string(),
  key_trends: z.array(z.string()),
  concerns: z.array(z.string()),
  incidents_this_week: z.number(),
});

export type WeeklySummaryOutputSchema = z.infer<typeof zWeeklySummaryOutput>;

export const _WEEKLY_SUMMARY_SCHEMA_MATCHES: AssertEqual<
  WeeklySummaryOutputSchema,
  WeeklySummaryOutput
> = true;
