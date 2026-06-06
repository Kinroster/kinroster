// Registry: normalizes the heterogeneous prompt builders behind one uniform
// interface so the runner is prompt-agnostic. This is the ONE place where the
// per-prompt signature differences live (raw string vs param object, baked-in
// model const vs modelFor(), per-prompt maxTokens).

import type { ZodType } from 'zod';
import { modelFor } from '@/lib/claude';
import { SHIFT_NOTE_SYSTEM_PROMPT, buildShiftNoteUserPrompt } from '@/lib/prompts/shift-note';
import {
  INCIDENT_CLASSIFY_SYSTEM_PROMPT,
  INCIDENT_CLASSIFY_MODEL,
  buildIncidentClassifyUserPrompt,
} from '@/lib/prompts/incident-classify';
import { zShiftNoteOutput, zIncidentClassification } from '@/lib/schemas';
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
};
