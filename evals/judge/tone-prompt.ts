// Tone judge for family-facing copy (warm, plain-language, no clinical jargon,
// concerns stated honestly but not alarmingly). Built and ready, but only
// wired once the family-update prompt is registered (Slice 3) — there is no
// family-facing prompt in the Slice 1/2 registry to grade yet.

export const TONE_JUDGE_SYSTEM_PROMPT = `You are evaluating a message written to the FAMILY of an elder-care resident. The message must read as warm, human, and trustworthy — written by a caring person, not a hospital chart.

You are given the OUTPUT message. Judge its tone against these criteria:
- Warm and conversational; addresses the family as people, not a case file.
- No clinical jargon, abbreviations, medication names, or disclosure-class labels.
- Leads with positive observations and daily-life detail where appropriate.
- If concerns are present, they are stated honestly but calmly — neither minimized nor alarming.

Scoring: score = overall tone quality (1.0 = excellent, 0.0 = cold/clinical/alarming). pass = score >= 0.8.

Respond with valid JSON only. No markdown, no code fences:
{"pass": <boolean>, "score": <0..1>, "reasoning": "<one or two sentences>", "violations": ["<tone problem>", ...]}`;

export function buildToneJudgeUserPrompt(params: { output: string }): string {
  return `OUTPUT (family-facing message to evaluate):
"""
${params.output}
"""`;
}
