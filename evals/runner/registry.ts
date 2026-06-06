// Registry: normalizes the heterogeneous prompt builders behind one uniform
// interface so the runner is prompt-agnostic. This is the ONE place where the
// per-prompt signature differences live (raw string vs param object vs
// notes[], baked-in model const vs modelFor(), per-prompt maxTokens).

import type { ZodType } from 'zod';
import { modelFor } from '@/lib/claude';
import { SHIFT_NOTE_SYSTEM_PROMPT, buildShiftNoteUserPrompt } from '@/lib/prompts/shift-note';
import {
  INCIDENT_CLASSIFY_SYSTEM_PROMPT,
  INCIDENT_CLASSIFY_MODEL,
  buildIncidentClassifyUserPrompt,
} from '@/lib/prompts/incident-classify';
import {
  INCIDENT_REPORT_SYSTEM_PROMPT,
  buildIncidentReportUserPrompt,
} from '@/lib/prompts/incident-report';
import {
  CLINICIAN_SUMMARY_SYSTEM_PROMPT,
  buildClinicianSummaryUserPrompt,
} from '@/lib/prompts/clinician-summary';
import {
  FAMILY_UPDATE_SYSTEM_PROMPT,
  buildFamilyUpdateUserPrompt,
} from '@/lib/prompts/family-update';
import {
  WEEKLY_SUMMARY_SYSTEM_PROMPT,
  buildWeeklySummaryUserPrompt,
} from '@/lib/prompts/weekly-summary';
import {
  VOICE_SANITY_SYSTEM_PROMPT,
  VOICE_SANITY_MODEL,
  buildVoiceSanityUserPrompt,
} from '@/lib/prompts/voice-sanity';
import {
  zShiftNoteOutput,
  zIncidentClassification,
  zIncidentReportOutput,
  zClinicianSummaryOutput,
  zFamilyUpdateOutput,
  zWeeklySummaryOutput,
  zVoiceSanityOutput,
} from '@/lib/schemas';
import type { PromptId } from './types';

export interface PromptEntry {
  id: PromptId;
  systemPrompt: string;
  model: string;
  maxTokens: number;
  schema: ZodType<unknown>;
  /** Adapts a case's `input` payload to the real prod builder's signature. */
  buildUserPrompt: (input: Record<string, unknown>) => string;
}

function str(input: Record<string, unknown>, key: string, fallback = ''): string {
  const v = input[key];
  return typeof v === 'string' ? v : fallback;
}

function strOrNull(input: Record<string, unknown>, key: string): string | null {
  const v = input[key];
  return typeof v === 'string' ? v : null;
}

/** Normalize a case's `notes` payload to the shape the summary builders expect. */
function notesArr(
  input: Record<string, unknown>
): Array<{
  created_at: string;
  author_name: string;
  structured_output: string;
  shift: string | null;
}> {
  const v = input.notes;
  if (!Array.isArray(v)) return [];
  return v.map((n) => {
    const note = (n ?? {}) as Record<string, unknown>;
    return {
      created_at: str(note, 'created_at'),
      author_name: str(note, 'author_name'),
      structured_output: str(note, 'structured_output'),
      shift: strOrNull(note, 'shift'),
    };
  });
}

export const REGISTRY: Record<PromptId, PromptEntry> = {
  'shift-note': {
    id: 'shift-note',
    systemPrompt: SHIFT_NOTE_SYSTEM_PROMPT,
    model: modelFor('structure'),
    maxTokens: 1024,
    schema: zShiftNoteOutput,
    buildUserPrompt: (input) =>
      buildShiftNoteUserPrompt({
        residentFirstName: str(input, 'residentFirstName', 'Resident'),
        residentLastName: str(input, 'residentLastName', ''),
        careNotesContext: strOrNull(input, 'careNotesContext'),
        conditions: strOrNull(input, 'conditions'),
        timestamp: str(input, 'timestamp', '2026-04-05T12:00:00Z'),
        caregiverName: str(input, 'caregiverName', 'Caregiver'),
        rawInput: str(input, 'rawInput'),
        localeContext: null,
      }),
  },
  'incident-classify': {
    id: 'incident-classify',
    systemPrompt: INCIDENT_CLASSIFY_SYSTEM_PROMPT,
    model: INCIDENT_CLASSIFY_MODEL,
    maxTokens: 100,
    schema: zIncidentClassification,
    buildUserPrompt: (input) => buildIncidentClassifyUserPrompt(str(input, 'rawInput')),
  },
  'incident-report': {
    id: 'incident-report',
    systemPrompt: INCIDENT_REPORT_SYSTEM_PROMPT,
    model: modelFor('structure'),
    maxTokens: 1500,
    schema: zIncidentReportOutput,
    buildUserPrompt: (input) =>
      buildIncidentReportUserPrompt({
        residentFirstName: str(input, 'residentFirstName', 'Resident'),
        residentLastName: str(input, 'residentLastName', ''),
        conditions: strOrNull(input, 'conditions'),
        timestamp: str(input, 'timestamp', '2026-04-06T08:30:00Z'),
        caregiverName: str(input, 'caregiverName', 'Caregiver'),
        rawInput: str(input, 'rawInput'),
        localeContext: null,
      }),
  },
  'clinician-summary': {
    id: 'clinician-summary',
    systemPrompt: CLINICIAN_SUMMARY_SYSTEM_PROMPT,
    model: modelFor('summarize'),
    maxTokens: 1500,
    schema: zClinicianSummaryOutput,
    buildUserPrompt: (input) =>
      buildClinicianSummaryUserPrompt({
        facilityName: str(input, 'facilityName', 'Sunrise Senior Care'),
        residentFirstName: str(input, 'residentFirstName', 'Resident'),
        residentLastName: str(input, 'residentLastName', ''),
        residentDob: strOrNull(input, 'residentDob'),
        clinicianName: str(input, 'clinicianName', 'Dr. Lee'),
        relationship: str(input, 'relationship', 'Primary care physician'),
        dateRangeStart: str(input, 'dateRangeStart', '2026-04-01'),
        dateRangeEnd: str(input, 'dateRangeEnd', '2026-04-07'),
        conditions: strOrNull(input, 'conditions'),
        careNotesContext: strOrNull(input, 'careNotesContext'),
        notes: notesArr(input),
        localeContext: null,
      }),
  },
  'family-update': {
    id: 'family-update',
    systemPrompt: FAMILY_UPDATE_SYSTEM_PROMPT,
    model: modelFor('summarize'),
    maxTokens: 1024,
    schema: zFamilyUpdateOutput,
    buildUserPrompt: (input) =>
      buildFamilyUpdateUserPrompt({
        facilityName: str(input, 'facilityName', 'Sunrise Senior Care'),
        residentFirstName: str(input, 'residentFirstName', 'Resident'),
        residentLastName: str(input, 'residentLastName', ''),
        familyContactName: str(input, 'familyContactName', 'Sarah'),
        relationship: str(input, 'relationship', 'Daughter'),
        dateRangeStart: str(input, 'dateRangeStart', '2026-04-01'),
        dateRangeEnd: str(input, 'dateRangeEnd', '2026-04-07'),
        notes: notesArr(input),
        localeContext: null,
      }),
  },
  'weekly-summary': {
    id: 'weekly-summary',
    systemPrompt: WEEKLY_SUMMARY_SYSTEM_PROMPT,
    model: modelFor('summarize'),
    maxTokens: 1500,
    schema: zWeeklySummaryOutput,
    buildUserPrompt: (input) =>
      buildWeeklySummaryUserPrompt({
        facilityName: str(input, 'facilityName', 'Sunrise Senior Care'),
        residentFirstName: str(input, 'residentFirstName', 'Resident'),
        residentLastName: str(input, 'residentLastName', ''),
        conditions: strOrNull(input, 'conditions'),
        careNotesContext: strOrNull(input, 'careNotesContext'),
        weekStart: str(input, 'weekStart', '2026-04-01'),
        weekEnd: str(input, 'weekEnd', '2026-04-07'),
        notes: notesArr(input),
        localeContext: null,
      }),
  },
  'voice-sanity': {
    id: 'voice-sanity',
    systemPrompt: VOICE_SANITY_SYSTEM_PROMPT,
    model: VOICE_SANITY_MODEL,
    maxTokens: 400,
    schema: zVoiceSanityOutput,
    buildUserPrompt: (input) => buildVoiceSanityUserPrompt(str(input, 'transcript')),
  },
};
