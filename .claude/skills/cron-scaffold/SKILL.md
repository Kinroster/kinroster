---
name: cron-scaffold
description: |
  Scaffold a Kinroster background job + its secured cron route: a
  src/lib/jobs/<name>.ts module exporting an async runner (typed Options/
  Result, service-role client, per-org iteration, consent gating, returns
  counts) and a src/app/api/cron/<name>/route.ts GET handler gated by the
  CRON_SECRET bearer token. Reminds where the schedule must be registered.

  Use this skill when the user says any of: "new cron job", "scaffold a
  background job", "add a scheduled task", "new cron route",
  "/cron-scaffold".

  IMPORTANT: The cron route MUST check the CRON_SECRET bearer token before
  doing anything. Jobs run with the service-role client (they bypass RLS) so
  they must scope every query by organization themselves and respect consent
  gates. This repo's vercel.json has NO crons block — the schedule is
  registered externally; don't claim it auto-runs.
---

# Cron scaffold — background job + secured cron route

A Kinroster background task is two files: the **job** (`src/lib/jobs/<name>.ts`,
the testable logic) and the **cron route** (`src/app/api/cron/<name>/route.ts`,
a thin auth-gated trigger). This skill emits both in the house pattern.

Canonical references:
- `src/app/api/cron/weekly-summaries/route.ts` → the route pattern
- `src/lib/jobs/weekly-summaries.ts` → job with per-org iteration + PDPA
  consent gating; `src/lib/jobs/retry-failed-structuring.ts` → job using
  `createAdminClient()`
- `src/lib/supabase/admin.ts` → `createAdminClient()` (service-role)

## Step 1 — gather inputs

Ask what's missing:
1. **Job name** (kebab-case → `<name>.ts` and `/api/cron/<name>`).
2. **What it does** each run, and what it returns (counts for the response).
3. **Cadence** (e.g. weekly Sun 18:00 in org tz, nightly) — for the schedule
   reminder, and any per-org timezone logic.
4. **Consent/eligibility gates** — does it touch resident PHI that needs an
   active PDPA consent or an org setting? (weekly-summaries gates on
   `hasActivePdpaConsent` / `pdpaConsentRequired`.)

## Step 2 — scaffold the job `src/lib/jobs/<name>.ts`

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export interface Run<Name>Options {
  now?: Date;   // injectable for tests
}

export interface Run<Name>Result {
  // counts the cron response will report, e.g.
  processed: number;
  orgsConsidered: number;
}

export async function run<Name>(
  options: Run<Name>Options = {}
): Promise<Run<Name>Result> {
  const supabase = createAdminClient();   // service-role: bypasses RLS
  const now = options.now ?? new Date();

  let processed = 0;
  let orgsConsidered = 0;

  const { data: orgs } = await supabase.from("organizations").select("id, timezone");
  for (const org of orgs ?? []) {
    orgsConsidered++;
    // Scope EVERY query by org.id — the service-role client has no RLS.
    // Respect consent/eligibility gates before touching resident PHI.
    // …do the work, increment processed…
  }

  return { processed, orgsConsidered };
}
```

- Take `now?: Date` in Options so tests can pin time (weekly-summaries does).
- **Scope every query by `organization_id`** — the service-role client has no
  RLS to fall back on.
- Apply consent gates (e.g. `hasActivePdpaConsent`) before generating or
  sending anything about a resident.

## Step 3 — scaffold the route `src/app/api/cron/<name>/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { run<Name> } from "@/lib/jobs/<name>";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await run<Name>();

  return NextResponse.json({
    message: `…${result.processed}…`,
    ...result,
  });
}
```

- **The `CRON_SECRET` check is first and non-negotiable** — without it the
  endpoint is an open trigger for a service-role job.
- Keep the route thin: auth → call the job → return its result. All logic
  lives in the job (so it's unit-testable without HTTP).

## Step 4 — register the schedule (don't assume it's automatic)

This repo's `vercel.json` currently has **no `crons` block**, so adding a
route does **not** make it run. Tell the user to register the schedule where
this project manages them — either by adding a `crons` entry that calls
`/api/cron/<name>` (Vercel Cron), or in whatever external scheduler is in
use — and that the scheduler must send `Authorization: Bearer $CRON_SECRET`.
Don't claim the job is live until the schedule exists.

## Step 5 — confirm

Report the two files, the result shape the route returns, the consent gates
applied, and the schedule-registration reminder. Suggest a unit test for the
job (inject `now`) and `pnpm exec tsc --noEmit`.

## Hard rules (never break these)

- **Auth first.** The route must reject anything without the correct
  `Bearer $CRON_SECRET` before running the job.
- **Service-role means you own scoping.** Jobs bypass RLS — scope every
  query by `organization_id`; never rely on RLS in a job.
- **Respect consent/eligibility gates** before touching or sending resident
  PHI (PDPA active-consent checks, org settings).
- **Logic in the job, not the route.** The route is a thin trigger; the job
  is the testable unit (accept `now?: Date`).
- **Don't claim it's scheduled.** vercel.json has no crons here — always
  include the "register the schedule" step; never imply adding the route
  makes it run.
- **No PHI in the response/logs.** Return counts and ids, not clinical
  content.
- **Don't invent business logic.** Scaffold the loop + plumbing; ask for the
  real per-org work.

## When to ask vs. when to act

| Situation | Action |
|---|---|
| `/cron-scaffold` with no detail | Ask: job name, what it does + returns, cadence, consent gates. |
| User describes it fully | Scaffold both files; leave the per-org work body to them. |
| Job touches resident PHI | Add the consent/eligibility gate before the action; note it. |
| User assumes it'll run after merge | Correct them: register the schedule (vercel.json crons or external) with the CRON_SECRET header. |
| Job needs per-org timezone | Mirror weekly-summaries' tz handling (`date-fns-tz`). |
