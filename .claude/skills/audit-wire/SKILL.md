---
name: audit-wire
description: |
  Wire correct compliance logging into a Kinroster API route that touches
  PHI: an actor-centric audit event via logAudit() (extending the
  AuditEventType / AuditObjectType unions when the event/object is new) and,
  for any disclosure of PHI to a recipient, an append-only disclosure_events
  insert with the right recipient_type / legal_basis / categories_shared /
  source_note_ids / delivery_method.

  Use this skill when the user says any of: "add audit logging to this
  route", "wire up the audit event", "log this disclosure", "add a
  disclosure event", "/audit-wire".

  IMPORTANT: audit_events is written via the logAudit() helper (service-role,
  fire-and-forget, never blocks the request); disclosure_events is an awaited
  insert via the AUTHENTICATED client (it has an RLS INSERT policy). Never
  log PHI into metadata. Never double-log notes / notes_sensitive_access —
  DB triggers already cover those.
---

# Audit wire — add the right compliance logging to a PHI route

Kinroster has two complementary logs. Get the distinction right — it decides
which client you use and whether you await:

- **`audit_events`** — *actor-centric*: "who did what in the system." Write
  via `logAudit()` from `src/lib/audit.ts`. It uses the **service-role**
  client (the table has no INSERT policy) and is **fire-and-forget** (it
  swallows errors so audit never breaks the user flow).
- **`disclosure_events`** — *patient-centric*: "who received PHI about this
  resident." Write via an **awaited insert on the authenticated `supabase`
  client** (the table has an RLS INSERT policy requiring `actor_user_id =
  auth.uid()`). This is compliance-critical — let it surface errors.

A disclosure route usually needs **both**: a `share_create`/`export`/
`family_send` audit event *and* a `disclosure_events` row.

Canonical references:
- `src/lib/audit.ts` → `logAudit()` signature, `AuditEventType`,
  `AuditObjectType`, `AuditResult`
- `src/app/api/residents/[id]/report/route.ts` and `.../export/route.ts` →
  real `disclosure_events` insert shape
- existing `logAudit(...)` callsites under `src/app/api/...` (e.g.
  `recording-consents`, `residents/[id]/export`)

## Step 1 — classify the action

Read the route. Determine:
- **Is it a compliance-relevant action?** (login, share, export, send,
  consent capture/withdraw, permission change, mandatory report, deletion,
  revoke…) → needs an **audit event**.
- **Does it disclose PHI to a recipient** (clinician, family, agency, export
  download)? → also needs a **disclosure event**.
- **Does it write `notes` or `notes_sensitive_access`?** → those are
  **already** logged by DB triggers (`00009_audit_events.sql`); do **not**
  add a `logAudit` for the create/update/delete of those — you'd
  double-log.

## Step 2 — wire the audit event

Insert near the point of the action (after it succeeds, or with
`result: "denied"`/`"error"` on the failure path where useful):

```ts
import { logAudit } from "@/lib/audit";

await logAudit({
  organizationId: <org id>,
  userId: user.id,            // null for unauthenticated portal opens
  eventType: "<AuditEventType>",
  objectType: "<AuditObjectType>",
  objectId: <id>,
  result: "success",          // or "denied" | "error"
  metadata: { /* NON-PHI context only */ },
  request,                    // lets the helper capture IP + user-agent
});
```

- If the `eventType` or `objectType` you need **doesn't exist**, add it to
  the union in `src/lib/audit.ts` — don't pass a string that isn't in the
  union (it won't type-check, and that's intentional).
- `logAudit` is fire-and-forget; `await` it but know it never throws.

## Step 3 — wire the disclosure event (only if PHI leaves to a recipient)

Use the **authenticated** `supabase` client (not admin), awaited:

```ts
await supabase.from("disclosure_events").insert({
  organization_id: <org id>,
  resident_id: <resident id>,
  actor_user_id: user.id,         // RLS requires this == auth.uid()
  recipient_type: "<clinician | family_contact | agency_internal | ...>",
  recipient_id: <id | null>,
  legal_basis: "<treatment | payment | operations | personal_representative | patient_agreement | ...>",
  categories_shared: [ /* e.g. "notes", "incidents", "weekly_summaries" */ ],
  source_note_ids: [ /* ids actually disclosed */ ],
  delivery_method: "<magic_link_portal | email | download | ...>",
  // share_link_id: <id>  // when the disclosure is via a share link
});
```

Match the exact column set and the allowed enum-ish values to the existing
inserts in `report/route.ts` and `export/route.ts` — don't invent a
`recipient_type`/`legal_basis` value; reuse the ones already in use.

## Step 4 — confirm

Report: which event(s) you wired, any union additions to `audit.ts`, and
that notes/sensitive-access were intentionally left to the DB triggers.
Suggest the user run `pnpm exec tsc --noEmit` (the union change must type-check)
and the relevant route test.

## Hard rules (never break these)

- **No PHI in metadata.** `metadata` and audit fields capture *what
  happened*, never clinical content, note bodies, or message text. Use ids,
  types, counts — not the PHI itself.
- **Right client, right await.** `audit_events` → `logAudit()` (service-role,
  fire-and-forget). `disclosure_events` → authenticated `supabase` insert,
  awaited, error-surfacing. Don't cross these.
- **New event/object types go in the union.** Extend `AuditEventType` /
  `AuditObjectType` in `audit.ts`; never stringly-type a value outside it.
- **Don't double-log notes / notes_sensitive_access.** DB triggers already
  log create/update/delete + grant/revoke for those tables.
- **Don't block the user flow on audit.** Never make a user-facing response
  depend on the audit write succeeding (the helper already guarantees this —
  don't re-throw around it).
- **Reuse existing enum values.** `recipient_type` / `legal_basis` /
  `delivery_method` must match values already used in the codebase, not
  freshly invented strings.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| "add audit logging to <route>" | Read it, classify (Step 1), wire the audit event; add disclosure event if PHI leaves. |
| Action discloses PHI to a recipient | Wire both the audit event and `disclosure_events`. |
| Route writes notes / notes_sensitive_access | Do NOT add audit for those writes — DB triggers cover them; say so. |
| Needed eventType/objectType doesn't exist | Add it to the union in `audit.ts`, then use it. |
| Unsure of recipient_type / legal_basis value | Grep existing `disclosure_events` inserts and reuse a matching value; ask if genuinely novel. |
| Tempted to put note text / message body in metadata | Refuse; log ids/types/counts instead. |
