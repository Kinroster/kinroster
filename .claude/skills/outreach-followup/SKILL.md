---
name: outreach-followup
description: |
  Find leads from past lead-batch outreach batches that are due a follow-up
  and draft the follow-up messages. Reads the batch files in
  docs/marketing/outreach-batches/, finds leads past their suggested
  follow-up date, and drafts one 5-day or 14-day follow-up each (using the
  follow-up sequence in docs/marketing/linkedin-cold-outreach.md), into a
  review file the user sends manually.

  Use this skill when the user says any of: "follow up on outreach", "who's
  due for a follow-up", "draft follow-ups", "/outreach-followup".

  IMPORTANT: Drafts only — like lead-batch, it NEVER sends anything to
  LinkedIn, never automates, and never scrapes. Follow up at most twice (one
  5-day, one 14-day) then drop the lead. The user reviews and sends each
  message manually.
---

# Outreach follow-up — draft due follow-ups from lead-batch batches

This is the follow-up companion to the `lead-batch` skill. `lead-batch`
writes initial-outreach batches; this skill reads them back, finds who's due,
and drafts the next touch. Same hard constraints as `lead-batch`: drafts
only, manual send, no automation.

Canonical references:
- `docs/marketing/outreach-batches/*.md` → the batch files `lead-batch`
  produced (each has a summary table with a follow-up date and per-lead
  sections with "Suggested follow-up date")
- `docs/marketing/linkedin-cold-outreach.md` → the **Follow-up sequence**
  section (5-day, 14-day) and the rule "don't follow up more than twice"
- the `lead-batch` skill → shared voice, brand identity, and hard rules

## Step 1 — gather the batches and today's date

Read the batch files:

```bash
ls -1 docs/marketing/outreach-batches/*.md 2>/dev/null
```

Establish "today" — ask the user if you can't determine the current date;
never guess a date. Follow-up timing is date math, so the date must be real.

## Step 2 — find who's due

For each lead across all batches, read its **Suggested follow-up date** and
work out its follow-up state:
- **Due for 1st follow-up** — initial message was sent, today ≥ the suggested
  (5-business-day) follow-up date, and no follow-up has been logged yet.
- **Due for 2nd follow-up** — a 1st follow-up went out, today ≥ ~14 days
  after the initial, and no 2nd follow-up yet.
- **Drop** — already followed up twice → do NOT draft a third. Per the
  outreach doc: one 5-day, one 14-day, then move on.

Follow-up state may not be fully recorded in the batch files (the user logs
sends in their tracker). When you can't tell whether a lead already got a
follow-up, **ask the user** rather than risk a duplicate or a third touch.

## Step 3 — draft each follow-up

Open `docs/marketing/linkedin-cold-outreach.md` → **Follow-up sequence**. For
each due lead, draft the appropriate touch (5-day vs 14-day) following those
templates. Same rules as `lead-batch`:
- **Under 80 words**, no links, one clear ask, honour regional voice
  (US English vs Taiwan zh-TW).
- Reference the original hook/signal so the follow-up reads as a continuation,
  not a fresh cold message.
- Keep the brand identity (Kinroster, small RCFE focus, free pilot).
- Don't fabricate facts about the lead.

## Step 4 — write the follow-up review file

Write to `docs/marketing/outreach-batches/followup-<YYYY-MM-DD-HHMM>.md`
(same directory, `followup-` prefix). Mirror the `lead-batch` review-file
structure: a summary table (lead, which follow-up #, due date), then one
section per lead with the profile link, follow-up number, and the draft in a
fenced block, then a workflow-reminder footer. Disambiguate filename
collisions with `-2`, `-3`.

## Step 5 — confirm and stop

Report: file path, how many follow-ups drafted (split by 1st/2nd), any leads
that hit the **drop** rule, and any leads you skipped pending the user's
confirmation of follow-up state. Suggest: "Open `<file>` to review. Send each
manually and log it in your tracker." Do not offer to send.

## Hard rules (never break these)

- **No automated sending.** Same as `lead-batch` — LinkedIn ToS forbids it;
  refuse even if asked. Drafts only; the user sends manually.
- **No scraping / no automation** of LinkedIn.
- **Max two follow-ups, then drop.** Never draft a third touch for a lead.
- **No fabrication.** Don't invent the lead's reply, status, or new facts.
- **No PII in commits.** Batch and follow-up files contain lead PII — they
  belong in a gitignored location and must not be committed. NOTE: the
  `docs/marketing/outreach-batches/` directory is currently **not**
  gitignored in this repo even though `lead-batch` claims it is — warn the
  user not to commit these files (and that the ignore rule should be added).
- **No links in the message body.**
- **Never guess a date.** Follow-up timing is date math; ask if unsure.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/outreach-followup` | List due leads from the batches; draft their follow-ups; write the review file. |
| A lead's follow-up state is unclear | Ask the user before drafting (avoid a duplicate or a third touch). |
| A lead has had two follow-ups | Mark it **drop**; do not draft. |
| No batches exist yet | Tell the user to run `lead-batch` first; nothing to follow up on. |
| User asks to auto-send / DM these | Refuse; cite the rules. Offer to redraft a specific one. |
| User asks for a third follow-up | Decline per the "twice then drop" rule; suggest moving on. |
