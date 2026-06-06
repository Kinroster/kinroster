---
name: family-update-draft
description: |
  Draft the preamble / wrapper text for a family update — greeting, framing,
  and structure — in the contact's preferred language and cultural register,
  scoped to what that contact is authorized to receive. It produces a
  fill-in-the-blanks template with placeholders for the clinical specifics;
  it does NOT write the actual observations and does NOT send anything.

  Use this skill when the user says any of: "draft a family update", "help
  me word an update for the family", "family update preamble",
  "/family-update-draft".

  IMPORTANT: This skill NEVER fabricates clinical content or PHI. It writes
  tone/structure with [placeholders] the admin fills in. It respects the
  contact's authorization scope (won't propose categories they aren't
  cleared for) and defers all actual disclosure to the in-app gated send
  flow, which enforces authorization and logs the disclosure.
---

# Family update draft — authorization-aware preamble, not PHI

Caregivers spend time wording family updates warmly and in the right
register. This skill drafts the **wrapper** — greeting, framing, the
structure of the message, the sign-off — in the family contact's language
and cultural register, scoped to what they're authorized to receive. The
**clinical content stays a placeholder** for the admin to fill, and the
**actual send** goes through the in-app gated flow that enforces
authorization and records the disclosure. This skill is a writing aid, not a
disclosure mechanism.

Canonical references:
- `src/components/residents/family-contact-form.tsx` → `SCOPE_OPTIONS`
  (the authorization categories) and the legal-basis flags
  (`involvedInCare`, `personalRepresentative`, `authorizationOnFile`)
- `src/lib/prompts/family-update.ts` / `prompts/family-update.md` → the
  in-app family-update prompt (tone, cultural register, per-language fan-out)
- `_shared.ts` cultural-register rules (indirect vs direct register)
- the gated send route (`POST /api/family/send`) → where real disclosure
  actually happens (this skill does NOT call it)

## Step 1 — gather the contact's authorization context

You need (ask, or have the user pull from the family-contact record):
1. **Preferred language** — `en | zh-TW | vi | id` (or "not specified" → en).
2. **Legal basis** — `involved_in_care` (basic), `personal_representative`
   (higher detail), or `authorization_on_file` (explicit signed auth).
3. **Authorized scope** — the subset of `SCOPE_OPTIONS` the contact is
   cleared for: `visit_notifications`, `appointment_logistics`,
   `medication_adherence_summary`, `safety_alerts`, `wellbeing_summary`,
   `task_completion`, `incident_notifications`.
4. **Occasion** — routine weekly note, a specific event, an appointment, etc.

If scope/legal basis is unknown, **ask** — don't assume a broad scope.

## Step 2 — draft the preamble (structure + placeholders only)

Produce a message skeleton in the preferred language:
- **Greeting** using the contact's relationship and the resident's name
  (honorific-correct; the form/prompt carry naming rules).
- **Framing sentence** matching the occasion and register.
- **Body sections — one per authorized scope category only**, each a heading
  + a `[placeholder: the admin fills the specific observation here]`. Never
  invent the observation; leave the bracket.
- **Sign-off** appropriate to the facility and register.

Honor the **cultural register**:
- Taiwanese / Vietnamese / Indonesian contacts → indirect: lead with
  positives, soften concerns, full honorifics every time.
- Western contacts → direct but warm.

Scope discipline: if a category isn't in the contact's authorized scope,
**do not include a section for it** — and if the user asks you to add one,
flag that it's outside the authorization and route them to update the
contact's scope first.

## Step 3 — hand off to the gated send flow

State clearly: this is a draft wrapper. To actually send, the admin uses the
in-app family-update flow (`POST /api/family/send`), which re-checks the
contact's authorization, filters notes by scope, and logs a
`disclosure_events` row. This skill does not send and does not assemble the
real PHI.

## Step 4 — confirm

Report: the language and register used, which scope categories you included
(and any the user requested that were out of scope and excluded), and the
reminder that clinical specifics are placeholders to fill in-app.

## Hard rules (never break these)

- **Never fabricate clinical content or PHI.** Observations, vitals,
  incidents, medication details — all stay `[placeholders]`. You write the
  wrapper, never the substance.
- **Respect authorization scope.** Only include sections for categories the
  contact is cleared for. Out-of-scope request → refuse and point to
  updating the contact's authorization.
- **Never send, never call the send API.** Disclosure happens only through
  the in-app gated flow that enforces auth and logs it. You produce text.
- **Honor language + register.** Draft in the contact's preferred language
  with the correct cultural register; don't default everything to English/direct.
- **Not clinical advice.** Claude is a scribe — no diagnosis, no treatment
  recommendation, even in framing text.
- **Don't widen disclosure.** Personal-representative / authorization-on-file
  may permit more detail than involved-in-care, but you still only scaffold —
  never pull more PHI in because the legal basis is broader.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/family-update-draft` with a known contact + occasion | Draft the scoped preamble in their language with placeholders. |
| Scope or legal basis unknown | Ask before drafting; don't assume broad scope. |
| User asks to include an out-of-scope category | Refuse; explain it's outside the authorization; point to updating scope. |
| User asks you to fill in the actual observations | Decline — leave placeholders; the admin fills clinical content in-app. |
| User asks to send it | Decline; direct them to the in-app gated send flow (`/api/family/send`). |
| Contact has no preferred language | Default to English; note the assumption. |
