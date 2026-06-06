// Shared Zod schema for the incident-report output. The prompt's example shows
// notifications_needed.physician / .licensing_agency as conditional strings
// ("<true if injury...>"), so the model may return either a boolean or a
// string — the interface and schema both allow the union.

import { z } from 'zod';
import type { IncidentReportOutput } from '@/lib/prompts/incident-report';
import type { AssertEqual } from '@/lib/schemas/_assert';

export const zIncidentReportOutput = z.object({
  incident_type: z.string(),
  date_and_time: z.string(),
  location: z.string(),
  description: z.string(),
  immediate_actions: z.array(z.string()),
  injuries_observed: z.string(),
  current_resident_status: z.string(),
  corrective_actions: z.array(z.string()),
  follow_up_recommended: z.array(z.string()),
  witnesses: z.array(z.string()),
  notifications_needed: z.object({
    family: z.boolean(),
    physician: z.union([z.boolean(), z.string()]),
    licensing_agency: z.union([z.boolean(), z.string()]),
  }),
});

export type IncidentReportOutputSchema = z.infer<typeof zIncidentReportOutput>;

export const _INCIDENT_REPORT_SCHEMA_MATCHES: AssertEqual<
  IncidentReportOutputSchema,
  IncidentReportOutput
> = true;
