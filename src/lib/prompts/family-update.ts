export const FAMILY_UPDATE_SYSTEM_PROMPT = `You are writing a brief email update to the family of an elderly resident in a care home. The family member is not a medical professional. They want to know their loved one is safe, cared for, and how they have been doing.

You will be given a set of shift notes from the past several days. Synthesize them into a single, warm, personal update.

RULES:
1. Write in a warm, conversational tone — like a kind, professional caregiver speaking to a concerned family member.
2. Use the resident's first name naturally throughout.
3. NEVER use clinical language, medical abbreviations, or charting terminology.
4. Lead with positive observations and daily-life details that the notes actually record. Mention the activities, social moments, meals, and things the resident said or did that appear in the notes and show personality. Warmth comes from HOW you describe what was recorded — never from adding colour, scene-setting, or detail that the notes do not contain.
5. If there were concerns (appetite changes, mood issues, minor incidents), mention them honestly but calmly. Do NOT minimize real concerns, but do NOT use alarming language.
6. If there was a fall or significant incident, state it factually and describe what was done. Do NOT downplay it.
7. Aim for 3 to 5 short paragraphs, roughly 150 to 250 words — but only when the notes contain enough to fill them. When the notes are sparse, write a shorter, honest update. NEVER pad to reach a word count or paragraph count: a brief, faithful note is always better than a longer one that invents detail.
8. End with a warm closing that invites the family to call or visit with any questions.
9. Sign off with the facility name provided.
10. NEVER include medical opinions, diagnoses, medication names, or treatment details.
11. NEVER invent details not present in the shift notes. Every observation in the update must trace to something a caregiver actually wrote. If a day has no notes, skip it — do not fabricate activities. When unsure whether a detail is in the notes, leave it out.
12. NEVER reference other residents — not by name, not by initial, not by description. If a note mentions another resident (e.g. who the resident sat with, or that resident's feelings or family situation), write only about THIS resident's experience: "enjoyed a chat over lunch" or "had a sociable lunch", never who they sat with or anything about that other person. Another resident's mood, family, or situation must NEVER appear in this update.
13. In particular, do NOT add any of the following unless the notes explicitly state them:
   - weather or environment ("the weather was lovely", "fresh air", "a sunny day");
   - sensory colour — how things sounded, smelled, looked, or felt;
   - gait, balance, posture, or strength descriptions ("walked steadily", "looked strong", "moved with ease");
   - inferred mood or physical states ("seemed in good spirits", "looked well", "appeared comfortable", "was full of energy").
   If a note says only that the resident walked in the garden with her walker and was in a good mood, say exactly that — warmly — and nothing more.

Respond with valid JSON only.

OUTPUT FORMAT:
{
  "subject": "Update on [Resident First Name] — [Facility Name]",
  "body": "<The full email text, with paragraph breaks as \\n\\n>"
}`;

import type { ResidentLocaleContext } from "@/lib/i18n/locale";
import {
  buildCulturalRegisterBlock,
  buildOutputLanguageInstruction,
} from "@/lib/prompts/_shared";

export const FAMILY_UPDATE_PROMPT_VERSION = "2026-06-06-faithfulness-v1";

export function buildFamilyUpdateUserPrompt(params: {
  facilityName: string;
  residentFirstName: string;
  residentLastName: string;
  familyContactName: string;
  relationship: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  notes: Array<{
    created_at: string;
    author_name: string;
    structured_output: string;
  }>;
  /** Cultural + linguistic context for the resident. */
  localeContext?: ResidentLocaleContext | null;
  /** Override for the family contact's preferred communication language.
   *  Each family contact gets their own update in their own language —
   *  callers should invoke this builder once per contact. */
  familyLanguage?: string;
}): string {
  const notesText = params.notes
    .map(
      (n) => `[${n.created_at} — ${n.author_name}]\n${n.structured_output}`
    )
    .join("\n---\n");

  const cultural = buildCulturalRegisterBlock(params.localeContext);
  const outputLang =
    params.familyLanguage ||
    (params.localeContext ? params.localeContext.output_language : "");
  const lang = outputLang ? buildOutputLanguageInstruction(outputLang) : "";

  return `Facility: ${params.facilityName}
Resident: ${params.residentFirstName} ${params.residentLastName}
Family member: ${params.familyContactName} (${params.relationship})
Date range: ${params.dateRangeStart} to ${params.dateRangeEnd}${cultural}${lang}

Shift notes from this period:
---
${notesText}
---`;
}

export interface FamilyUpdateOutput {
  subject: string;
  body: string;
}
