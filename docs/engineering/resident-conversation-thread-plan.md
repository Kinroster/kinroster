# Unified Resident Conversation Thread — Implementation Plan

## Progress

| Phase | Status | Branch / PR | Migration | Notes |
|---|---|---|---|---|
| **0a** Decisional capacity | ✅ Shipped 2026-05-22 | `claude/pr-66-implementation-95X9H` | 00028 | Table + history + snapshot trigger; admin UI at `/residents/[id]/capacity`; status banner on resident detail; audit event types added |
| **0b** Recording consent | ✅ Shipped 2026-05-22 | `claude/pr-66-implementation-95X9H` | 00029 | `resident_recording_consents` (3 classes × 13 jurisdictions); provisional multi-jurisdiction text templates (CIPA, BIPA, GDPR, PDPA); admin UI at `/residents/[id]/recording-consent`; hard-gate on `/api/voice/start` (no_consent + jurisdiction_mismatch both blocked + audited); resident detail banner |
| **0.5** Prompt caching migration | 🟡 Core shipped 2026-05-22 | `claude/pr-66-implementation-95X9H` | none | `claude.ts` extended w/ `userPromptCachedPrefix` + `cacheTtl` + `callClaudeWithUsage` (returns cache_read / cache_creation telemetry). Shift-note prompt split into cached resident prefix + volatile tail, structure-note migrated w/ 1h TTL + token telemetry persisted to `notes.metadata.tokens_used`. **Deferred**: per-resident systemPromptSuffix on the 4 other Sonnet sites (family-update, clinician-share, weekly-summaries, residents/summary), weekly-summaries → Batch API, incident-report Haiku swap golden-test, per-org cache-read-ratio dashboard |
| **1** Rolling caregiver thread | 🟡 Core shipped 2026-05-22 | `claude/pr-66-implementation-95X9H` | 00030 | `resident_conversation_threads` + `_versions` tables; `THREAD_UPDATE_SYSTEM_PROMPT` with 3-block cache; `updateThreadFromStructuredNote` service w/ CAS optimistic lock + per-note dedupe; `threadUpdateOnNoteStructured` Inngest function w/ per-resident `concurrency: { key, limit: 1 }` + 50-global cap + 3 retries; structure-note emits `thread/note-structured` event; `/api/voice/start` prefers thread.body over last-5-notes stitching (legacy fallback retained); prompt spec at `prompts/resident-conversation-thread-updater.md`; additive `voice_sessions.author_id` for Phase 2. **Deferred**: thread-compaction Inngest function (compaction queue index already exists), `<AIConversationThread>` UI component on resident detail, `prompts/vapi-intake-assistant.md` version bump |
| **2** Author generalization | ⏳ Next | — | 00031a + 00031b | Two-deploy rename; `is_staff()` helper |
| **3** Clinician accounts | ⏳ | — | 00032 | NPPES NPI lookup + admin attestation; Vapi clinician spec |
| **5** Two-way questions loop | ⏳ | — | none | After Phase 3 so the questions UI is wired into the clinician portal first |
| **4** Family accounts + async voice | ⏳ | — | 00033 | SMS OTP; admin moderation gate before Whisper |
| **6** Resident self-view | (Deferred) | — | — | Out of scope for this work |

## Context

Kinroster's current voice intake feels forgetful: each Vapi call starts fresh, the AI asks the same questions across shifts, and the same is true across the four parties around the resident (caregiver, admin, family, external clinician). The user asked whether the right answer is per-call summary grounding, full transcript context, or proper conversation threading — and whether family members and external clinicians could also record their voices so all conversations about one resident converge into one thread.

After deep research across the codebase, the product, user pain points, HIPAA posture, market context, and unit economics (three async agents), the answer is **proper conversation threading scoped per resident, contributed to by all authorized parties** — with a specific tiered economic model and phase ordering that this plan locks in.

### Challenges by party (research-grounded)

| Party | Core pain | Information they lack |
|---|---|---|
| **Caregiver** (the writer) | 45–90 min/shift on paperwork, often written from memory at shift end. No feedback loop from family/clinicians on what they reported. | Did the family hear? Did the clinician act? Were last shift's pending follow-ups completed? |
| **Admin/owner** (the editor) | 2+ hours/day rewriting caregiver notes for compliance; uses personal phone to text families. | Whether family read updates; whether clinicians have current info; what the family said in their last call. |
| **Family member** (the recipient) | "Feels she's bothering the staff." Only hears bad news. No reply channel. **Pain validated through admin proxies; direct family interviews still pending.** | Daily/weekly patterns, mood trajectory, whether their last concern was acted on. |
| **External clinician** (the under-served) | Between-visit hand-offs unstructured; relies on phone calls. **Clinician value-prop is explicitly unvalidated** — interview script exists in `docs/research/clinician-interviews-2026-05.md`, results don't. Mitigation: complete those interviews BEFORE Phase 3. | Structured trend data before each visit; whether their advice was implemented; new incidents since last contact. |
| **Resident** (subject, absent from the system) | No surface to see, correct, or speak into their own record. CIPA exposure if voice is recorded indirectly without consent. | Everything — they're an object of the system, not an agent in it. (Phase 6 deferred per user decision.) |

### User decisions locked in

1. **Full vision + family portal** with **full Supabase Auth accounts** for family and clinicians.
2. **Phase 0 (resident decisional-capacity + recording consent)** is a hard prerequisite — split into 0a (capacity) and 0b (recording consent) per plan-agent recommendation.
3. **Admin-mediated visibility** — caregivers' raw notes stay private. Family/clinician views render AI-structured slices (`family_safe_summary`, `clinician_clinical_summary`) only. Preserves caregiver candor.
4. **Tiered SKU for caregiver voice**:
   - **$149 default**: async voice memos for caregivers (PWA push-to-talk → Whisper → Claude). Sustainable at ~72% gross margin.
   - **$249 "Live Voice" upgrade**: Vapi for caregivers (live conversational AI). Covers ~$200/mo Vapi cost line.
   - Family is async-only on both SKUs (Whisper → Claude, no Vapi).
   - Clinicians use Vapi on both SKUs (low volume, ~$5/mo cost line).
5. **Cache everything** — prompt caching applied to all existing Claude calls + new thread updater.
6. **Phase 6 (resident self-view portal) deferred** out of scope for this work.

### Unit economics (12-bed facility, monthly, post-optimization)

| Line | $149 SKU (async caregivers) | $249 SKU (Vapi caregivers) |
|---|---|---|
| Caregiver voice + structuring | $22 (Whisper + Sonnet+cache + Haiku-thread+cache) | $230 (Vapi-Cartesia + Sonnet+cache + Haiku-thread+cache) |
| Family async memos | $2.14 | $2.14 |
| Clinician Vapi | $4.40 | $4.40 |
| Background (weekly+classification, Batch+cache) | $2.81 | $2.81 |
| SMS OTP + Vapi BAA amortized | $10.65 | $10.65 |
| **Total** | **~$42** | **~$250** |
| **Margin** | **+$107 (72%)** | **−$1 (essentially break-even; price needs $279 or BAA must amortize across more facilities)** |

The $249 tier needs revisiting after real Vapi billing data — the Vapi BAA $1,000/mo amortized over 100 facilities = $10/facility, but if subscribed-base is smaller the line is materially higher. Cited assumptions in agent output: Vapi $0.05/min platform + $0.05/min Cartesia STT/TTS, 1,575 caregiver-min/mo, Sonnet $3in/$15out per MTok, Haiku $1in/$5out per MTok, cache reads at 10% of input cost, Batch API 50% off, Twilio Verify $0.05/SMS, NPPES NPI lookup free.

---

## Architectural shape

### Data model — all migrations follow project conventions (RLS in same migration, `get_user_org_id()`/`is_admin()`/`is_staff()` helpers, append-only audit tables, partial indexes on hot predicates)

**Phase 0a — `00028_resident_decisional_capacity.sql`**
- `resident_decisional_capacity` (one current row per resident; UPDATE-able)
  - `capacity_status` CHECK `IN ('full', 'diminished_with_representative', 'lacks_capacity')`
  - representative fields: name, relationship, `authority_basis` (POA-healthcare, court-guardian, next-of-kin, spouse, other), `documentation_uri`
  - `assessed_by_user_id`, `assessed_at`, `next_review_due_at`
- `resident_decisional_capacity_history` (append-only audit; populated by `snapshot_capacity_history` trigger on status change)
- RLS: admins manage; staff read; service-role unrestricted.

**Phase 0b — `00029_resident_recording_consents.sql`**
- `resident_recording_consents` (append-only, modeled on `resident_pdpa_consents`)
  - `consent_class` CHECK `IN ('staff_dictation', 'resident_speaking', 'family_about_resident')` — three classes give CIPA granularity. Clinicians dictate, so they use `staff_dictation`.
  - consenting party: `consenting_party_type` ('resident' | 'personal_representative'), `consenting_party_name`, `consenting_party_relationship`
  - `jurisdiction` (CA, IL, WA, FL, TX, pdpa_tw, gdpr_eu, default) — the voice/start gate compares this to `organizations.regulatory_region` and BLOCKS on mismatch.
  - text snapshot: `consent_text_version`, `consent_text_locale`, `consent_text_snapshot`, `attorney_reviewed BOOLEAN`
  - signature: `signed_typed_name`, `consented_at`, `captured_by_user_id`, `ip_address`, `user_agent`
  - withdrawal: `withdrawn_at`, `withdrawn_by_user_id`, `withdrawal_reason`
  - Partial indexes on `(resident_id, consent_class)` and `(organization_id)` filtered by `withdrawn_at IS NULL`.
- RLS: admins manage; staff read.

**Phase 0.5 — caching migration is code-only, no schema change.**

**Phase 1 — `00030_resident_conversation_threads.sql`**
- `resident_conversation_threads` (one row per resident, UNIQUE on `resident_id`)
  - `version INTEGER` for **CAS optimistic locking** (CAS = compare-and-swap). The updater reads version N, computes N+1, and writes `WHERE id=? AND version=?`. A 0-row return triggers Inngest retry.
  - `body JSONB` with schema:
    ```
    { "schema_version": "v1",
      "narrative": "...",                      // 200-400 word free text
      "active_concerns": [{"concern", "since", "trend": "improving"|"stable"|"worsening"|"resolved"}],
      "baselines": {"mood", "appetite", "mobility", "sleep", ...},
      "recent_incidents": [{"date", "summary"}],
      "follow_ups_open": [...],
      "family_safe_summary": "...",            // pre-filtered for family audience
      "clinician_clinical_summary": "...",     // clinical-focus rephrase
      "notes_consumed_count": N }
    ```
  - `approximate_token_count` — partial index `WHERE approximate_token_count > 3000` for compaction queue
  - `last_note_id`, `last_updated_at`, `last_compacted_at`, `last_model_used`
  - `update_attempts`, `last_update_error`, `update_giving_up BOOLEAN` — mirrors `notes.structuring_giving_up` pattern
- `resident_conversation_thread_versions` (append-only, every accepted update)
  - `version` (UNIQUE with `thread_id`), `body` snapshot, `approximate_token_count`
  - `trigger` CHECK `IN ('note_insert', 'compaction', 'manual_regenerate')`
  - `triggering_note_id`, `diff JSONB` (generated at write time, not replayed)
  - `model_used`, `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` — telemetry for cost dashboards
- RLS: staff read threads (via `is_staff()` helper to be added in 00031); writes only via service-role (Inngest function). Admins read all versions.

**Phase 1 also includes**: additive nullable `voice_sessions.author_id UUID REFERENCES users(id)` column (NOT NULL flip lives in Phase 2). Removes a Phase 3 blocker.

**Phase 2 — `00031_author_generalization.sql`** (split as 00031a additive + 00031b NOT-NULL flip in separate deploys to survive a rolling release)
- `voice_sessions`: backfill `author_id = caregiver_id`, set `author_type` from users.role
- `notes`: add `author_type` CHECK `IN ('caregiver', 'admin', 'clinician', 'family')`
- Index: `idx_notes_resident_author_type ON notes (resident_id, author_type, created_at DESC)`
- Add `is_staff()` SECURITY DEFINER STABLE function = `role IN ('admin','caregiver','nurse_reviewer','compliance_admin')`. Replaces existing "NOT has_role('ops_staff') AND NOT has_role('billing_staff')" patterns and cleanly excludes new `clinician`/`family` roles from staff-only surfaces.

**Phase 3 — `00032_clinician_users.sql`**
- Extend `users_role_check` to include `'clinician'` and `'family'`.
- `clinician_users` (links existing `clinicians` to `auth.users`)
  - `user_id UUID REFERENCES auth.users(id) UNIQUE`, `clinician_id UUID REFERENCES clinicians(id) UNIQUE`
  - `npi`, `npi_verified_at`, `npi_verification_result JSONB`, `npi_verification_method` CHECK `IN ('pecos_api', 'manual_admin_attestation', 'cms_data_dump')`
  - `attested_by_user_id` (admin), `attested_at`, `attestation_notes` — **required even on PECOS pass** because PECOS confirms the NPI is real, not that the inviter is that person
  - `invite_status` CHECK `IN ('invited', 'active', 'suspended', 'revoked')`, `invite_sent_at`, `invite_accepted_at`
- RLS: admins manage; clinician reads own record.

**Phase 5 — minimal schema additions** (questions loop): extend `body.follow_ups_open` shape to tag question source/status; no new table required.

**Phase 4 — `00033_family_user_links.sql`**
- `family_user_links` (many-to-many via UNIQUE `(user_id, family_contact_id)`)
  - `user_id REFERENCES auth.users(id)`, `family_contact_id REFERENCES family_contacts(id)`
  - `phone_verified_at`, `phone_at_verification` (snapshot), `verification_method` CHECK `IN ('sms_otp', 'admin_manual')`
  - `link_status` CHECK `IN ('pending', 'active', 'revoked')`
  - admin can revoke without touching `family_contacts`
- `family_voice_memos` (async memo pipeline + **admin moderation gate**)
  - `storage_path` (private bucket `family-memos`), `audio_deleted_at`, `transcript`, `transcription_error`, `duration_seconds`
  - `note_id REFERENCES notes(id)` (set after structuring)
  - **`moderation_status` CHECK `IN ('pending', 'approved', 'rejected')`** — Whisper is NOT called until admin approves. Saves transcription cost on rejected memos and protects the thread from family content the admin doesn't want merged.
  - `moderated_by_user_id`, `moderated_at`, `moderation_reason`
- RLS: family reads own memos; family inserts own memos (gated by active link AND active consent); admins manage all.

### Inngest function — `threadUpdateOnNoteInsert`

```ts
export const threadUpdateOnNoteInsert = inngest.createFunction(
  {
    id: "thread-update-on-note-structured",
    concurrency: [
      { key: "event.data.residentId", limit: 1 },  // serialize per-resident
      { limit: 50 },                                // global cap
    ],
    retries: 3,
  },
  { event: "thread/note-structured" },
  async ({ event, step }) => {
    const thread = await step.run("get-or-create-thread", ...);
    const dup = await step.run("dedupe-note", ...);            // idempotency via triggering_note_id check
    if (dup) return { skipped: "already_applied" };
    const updatedBody = await step.run("call-claude-thread-updater", ...);  // memoized per Inngest run
    const wrote = await step.run("cas-write-thread", ...);     // UPDATE ... WHERE version = N RETURNING
    if (!wrote) throw new Error("thread_version_conflict");    // Inngest retries → re-reads → merges
    if (updatedBody.approximateTokenCount > 3000) {
      await step.sendEvent("queue-compaction", { name: "thread/compaction-requested", data: {...} });
    }
    return { threadId, newVersion: thread.version + 1 };
  }
);
```

Concurrency strategy: per-resident `limit: 1` serializes updates AND blocks the compaction job (which uses the same key) behind any in-flight update. Global `limit: 50` caps load. CAS lock + `triggering_note_id` dedupe make redeliveries idempotent.

Compaction is a sibling function (`threadCompaction`) on `thread/compaction-requested`. Guard against compaction loops: a thread is only compactable if `last_compacted_at IS NULL OR last_compacted_at < now() - interval '6 hours'`.

Error path: on parse failure or 3 consecutive Claude failures, `update_giving_up=true`, the prior thread body is preserved (voice calls keep grounding on last-good), admin UI shows "thread stale".

### Claude prompt structure for thread updater (3 cache breakpoints, under 4-max)

```
[CACHED block 1: THREAD_UPDATE_SYSTEM_PROMPT, ~1200 tok]     (cache_control: ephemeral)
[CACHED block 2: resident static context, ~300 tok]          (cache_control: ephemeral)
  - name, conditions, care_notes_context, cultural_register_block
[CACHED block 3: prior thread body JSON, ~1500 tok]          (cache_control: ephemeral, 5m TTL)
[UNCACHED tail: new note's structured_output + raw_input excerpt + author info]
```

Block 1 reuses across all residents in org. Block 2 reuses across every update for the same resident through the shift. Block 3 reuses across the family-memo + clinician-call + caregiver-shift triad on a hot resident within 5 min.

**Critical extension to `src/lib/claude.ts`**: add `userPromptCachedPrefix?: string` and `cacheTtl?: '5m' | '1h'` parameters. When `userPromptCachedPrefix` is set, the user message becomes two content blocks with the prefix marked cached. This unlocks the 3rd breakpoint that the audit confirmed no caller uses today.

The thread updater system prompt enforces:
1. Carry forward EVERYTHING the new note doesn't change.
2. Tag conflicts: "(previously X as of <date>; now Y)" in narrative.
3. NEVER invent facts.
4. Move concerns to `resolved` only on explicit statement; drop after 14 days resolved.
5. Drop incidents older than 30 days from `recent_incidents`.
6. `family_safe_summary` filters out `{care_team_only, billing_ops_only, sensitive_restricted}`.
7. `clinician_clinical_summary` filters out only `{billing_ops_only}`.
8. Family-authored notes treated as REPORTED ("Daughter reports X"), not authoritative.
9. Conflicts between family and caregiver same-day → keep BOTH tagged with source.
10. **`body.baselines` updates STRIPPED in code (not just prompt) when source was family** — defense in depth.

### Voice transport flows by tier

**$149 SKU — Async voice memos (NEW caregiver path)**

1. Caregiver opens app (PWA), picks resident, taps push-to-talk.
2. MediaRecorder (existing `voice-call-button.tsx` infra) → records.
3. POST `/api/voice/caregiver-memo` with `author_type: 'caregiver'`.
4. Server checks `resident_recording_consents.consent_class='staff_dictation'` is active.
5. Whisper transcribes (or Deepgram Nova-3 for cost — recommendation depends on accuracy benchmark on real audio).
6. Audio discarded.
7. `structureNote()` runs with `author_type='caregiver'`, default `disclosure_class` per existing rules.
8. On success: `inngest.send('thread/note-structured', ...)` → thread updates.

**$249 SKU — Vapi live voice (current path, kept)**

`/api/voice/start` (existing) is unchanged except the grounding block: replace last-5-notes stitching with thread fetch. See "Change to `/api/voice/start/route.ts`" below.

**Family async (both SKUs)** — `/api/family/memos`
1. Family logs into `/family/dashboard`, picks resident.
2. MediaRecorder records, uploads to `family-memos` storage bucket via signed URL.
3. POST `/api/family/memos` with `{residentId, storagePath}`.
4. Server checks active `family_user_links` + `resident_recording_consents.consent_class='family_about_resident'`.
5. Insert `family_voice_memos` with `moderation_status='pending'`. Admin notified.
6. **Audio NOT transcribed yet** — saves Whisper minutes on rejected memos.
7. Admin approves → Whisper transcribes → `structureNote()` runs with `author_type='family'` → thread updates → audio deleted.

**Clinician Vapi (both SKUs)** — `/api/clinician/voice/start`
1. Forks `/api/voice/start/route.ts`.
2. Authz: caller role `clinician` AND `resident_clinicians.clinician_id IN (SELECT clinician_id FROM clinician_users WHERE user_id = auth.uid())`.
3. Consent gate: `resident_recording_consents.consent_class='staff_dictation'` active.
4. New Vapi prompt: `prompts/vapi-clinician-assistant.md` — grounded on `body.clinician_clinical_summary`.
5. `voice_sessions.author_type='clinician'`, `call_type='clinician_intake'` (new CHECK value).
6. Webhook (`/api/voice/webhook`) extended for author-aware note creation.

### Change to `/api/voice/start/route.ts`

REMOVE: `NoteSummaryRow`, `extractSummary`, `formatRecentNotes`, `formatRecentIncidents`, the `recentNotesRes`/`recentIncidentsRes` queries, and the two `recentNotesSummary`/`recentIncidents` overrides.

ADD: single thread fetch + derived block:

```ts
const { data: threadRow } = await supabase
  .from("resident_conversation_threads")
  .select("body, version, update_giving_up, last_updated_at")
  .eq("resident_id", resident.id)
  .eq("organization_id", appUser.organization_id)
  .maybeSingle();

const threadBody = (threadRow?.body as ThreadBody | null) ?? EMPTY_THREAD_BODY;
const recentNotesSummary = threadBody.narrative || "";
const recentIncidents = threadBody.recent_incidents.map(i => `${i.date}: ${i.summary}`).join("\n");
const activeConcerns = threadBody.active_concerns.map(c => `${c.concern} (${c.trend}, since ${c.since})`).join("; ");

// buildAssistantOverrides gets a new `activeConcerns` variable; existing
// `recentNotesSummary` / `recentIncidents` variable names are repurposed to
// carry thread slices — no Vapi dashboard change needed.
```

Companion `prompts/vapi-intake-assistant.md` version bump to `2026-05-21-thread-grounding-v1`: add `active_concerns` to variables table, update Grounding-context section to reference thread slices.

### Auth onboarding flows

**Clinician invite** — `POST /api/clinicians/invite`
1. Authz: admin in caller's org owns the clinician directory entry.
2. NPPES NPI lookup (`lib/clinicians/npi.ts`): `https://npiregistry.cms.hhs.gov/api/?number={npi}&version=2.1` — free, no auth.
3. Validate `result.results[0].basic.status === 'A'` (active).
4. Fuzzy name match (Levenshtein ≤ 3) against `clinicians.full_name`; mismatch → 422.
5. `supabase.auth.admin.inviteUserByEmail(clinicians.email)`.
6. Insert `users` row with `role='clinician'`.
7. Insert `clinician_users` with frozen `npi_verification_result`, `attested_by_user_id`.
8. Log `disclosure_event` (legal_basis='operations', recipient_type='clinician').
9. Resend email with magic link → `/clinician/accept`.

PECOS failure path: save `npi_verification_method='cms_data_dump'`, flag `requires_admin_verification=true` until admin manually attests. NOT a silent fallback.

**Family invite + verify** — `POST /api/family/invite` then `POST /api/family/verify-otp`
1. Admin opens `family_contacts` card, clicks "Invite to portal". Server checks `family_contact.phone` is set.
2. Create `auth.users` with phone-primary auth; SMS OTP via Supabase Auth phone provider (Twilio Verify under the hood, ~$0.05/verification).
3. Insert `users(role='family')`, `family_user_links(link_status='pending')`.
4. Family enters 6-digit OTP → `supabase.auth.verifyOtp({phone, token, type: 'sms'})` → server flips `link_status='active'`, stamps `phone_verified_at`.
5. If `family_contact_pdpa_consents` lacks active row → redirect to `/family/consent`.

Rate limit: `/api/family/invite` at 3/day/family_contact_id; `/api/family/verify-otp` at 6/hour/phone. Captcha after 3 failed attempts.

### Thread compaction

Trigger: `approximate_token_count > 3000` after a successful update emits `thread/compaction-requested`. Separate Inngest function keeps hot-path latency low. Same per-resident `concurrency: 1` key serializes compaction behind updates.

Compaction prompt (`src/lib/prompts/thread-compact.ts`):
- Reduce narrative to ≤200 words preserving: all `active_concerns` mentions, most recent baselines, incidents from last 30 days, all `follow_ups_open`.
- Drop: resolved concerns last referenced >14 days ago, routine baseline mentions already in `baselines[]`, verbatim quotes >2 weeks old.
- MUST NOT add new clinical content; rephrase for brevity only.
- Recompute `family_safe_summary` and `clinician_clinical_summary` against the compacted narrative.

Guard against compaction loop: even if Claude returns a still-large body, `last_compacted_at < now() - interval '6 hours'` prevents re-trigger.

---

## Caching strategy (Phase 0.5)

Audit found 11 Claude call sites. `claude.ts` caches the system block but **no caller uses `systemPromptSuffix`** — the per-resident cultural/profile block is bundled into the system prompt as one string, defeating cross-resident reuse.

### Top 3 patches (concrete diffs)

**Patch A — `src/lib/claude.ts`**: add `userPromptCachedPrefix` + `cacheTtl: '5m' | '1h'` parameters. When set, user message becomes two content blocks with the prefix marked cached. (Full diff in plan-agent output; lifts the 3rd cache breakpoint into existence.)

**Patch B — `src/lib/services/structure-note.ts` + `src/lib/prompts/shift-note.ts`**: split `buildShiftNoteUserPrompt` into `buildShiftNoteUserPromptParts` returning `{cachedPrefix, volatileTail}`. Cached prefix = resident name + conditions + care_notes_context + cultural_register_block. Volatile tail = timestamp + caregiver + raw_input. Pass with `cacheTtl: '1h'` (caregivers log multiple notes per resident per shift; 1h amortizes the cache-write cost easily).

**Patch C — `src/lib/jobs/weekly-summaries.ts`**: migrate to Anthropic Messages Batches API. 50% off on all tokens, stacks with caching. Runs Sunday 18:00 — no latency need. Iterate `weekly_summaries` inserts after batch completion.

### Per-site caching table

| Site | Recommended cache_control | TTL | Model change | Savings |
|---|---|---|---|---|
| `structureNote` | breakpoint #1 system (exists), #2 after resident block in user prompt | 1h | none | ~70% input |
| `runVoiceSanity` | system only (exists) | 5m | none | ~50% |
| `runWeeklySummaries` | system + resident block, **move to Batch API** | 5m | Batch (50% off) | ~85% combined |
| `family-update` | system + resident-and-contact context | 1h | none | ~55% |
| `clinician-share` | system + resident profile | 1h | none | ~50% |
| `caregiver-summary` | system (exists), optional resident block | 5m | already Haiku ✓ | ~50% |
| `incident-classify` | system (exists) | 5m | already Haiku ✓ | ~60% |
| `incident-report` | system + resident block | 5m | **switch to Haiku 4.5 — test against Sonnet output on JSON schema first** | ~80% if Haiku passes |
| `demo-consult` | system | 5m | already Haiku ✓ | ~70% |
| `diligence-summarize` | system | 5m | **consider downgrade Opus 4.7 → Sonnet 4.6 (5x cheaper, JSON output is well-defined)** | ~30% caching + ~80% model |

### Other levers
- **Haiku 4.5 complexity classifier** upstream of `structureNote`: ~70% of caregiver notes are mundane; a 200-token Haiku classifier routes them to a Haiku-only structuring path. Sonnet only on flag-worthy. ~50–60% saving on the single biggest call site.
- **Idempotency for `structureNote`**: `notes.input_hash = sha256(redacted raw_input)`. Before calling Claude, check for matching hash + same resident with stored `structured_output` in last 24h. Reuses on retries.
- **Telemetry**: surface `cache_creation_input_tokens` + `cache_read_input_tokens` from Anthropic responses into `metadata.tokens_used` + per-org dashboard.

---

## Phased delivery (revised order per plan-agent recommendation)

**Recommended order: 0a → 0b → 0.5 → 1 → 2 → 3 → 5 → 4 → (deferred 6)**

Rationale: capacity (0a) is a pure admin-data shipping (~1 day); recording consent (0b) needs attorney text + i18n (~3-5 days). Caching (0.5) before Phase 1 means the thread updater ships with the new `userPromptCachedPrefix` extension already in place. Questions loop (5) before family (4) because two-way questions are primarily a clinician feature; wiring them after Phase 3 (while clinician portal is still in flux) is cheaper than retrofitting after family also uses the system.

### Phase 0a — Decisional capacity (1–2 days)

- Migration `00028_resident_decisional_capacity.sql` (table + history + trigger).
- Admin UI: capacity-assessment form on resident detail page.
- No voice-flow change yet.
- Validation: admin marks a resident `lacks_capacity`, designates representative, uploads documentation. History table captures status change.

### Phase 0b — Recording consent (3–5 days)

- Migration `00029_resident_recording_consents.sql`.
- Attorney-reviewed text templates (4-6 jurisdictions: CA, IL, WA, FL, TX, pdpa_tw, gdpr_eu, default).
- Admin UI: consent capture flow (typed signature, optional document upload, withdrawal).
- Voice/start gate update: hard-block if no active `staff_dictation` consent for the resident's jurisdiction.
- Validation: voice call works only when consent exists for caller's `consent_class` AND `jurisdiction` matches org's `regulatory_region`. Withdrawing consent immediately blocks new calls.

### Phase 0.5 — Caching migration (3–4 days)

- Extend `src/lib/claude.ts` with `userPromptCachedPrefix` + `cacheTtl`.
- Patch the 11 call sites per the per-site table.
- Migrate `weekly-summaries` to Batch API.
- Test `incident-report` Haiku swap (golden test set; 95%+ JSON-schema match threshold).
- Surface cache-read ratio metric per org.
- Validation: replay 100 historical calls in dev → confirm ≥40% cost reduction; no quality regression on golden test set.

### Phase 1 — Rolling caregiver thread (7–10 days)

- Migration `00030_resident_conversation_threads.sql` + additive `voice_sessions.author_id` nullable column.
- New prompt spec `prompts/resident-conversation-thread-updater.md` with system + version frontmatter + 4 cache breakpoints documented (only 3 used).
- New runtime `src/lib/prompts/thread-update.ts` + `src/lib/prompts/thread-compact.ts`.
- New job `src/lib/jobs/thread-update.ts` + `src/lib/jobs/thread-compaction.ts`.
- Register Inngest functions in `src/lib/inngest/functions.ts`.
- Modify `src/lib/services/structure-note.ts` to emit `thread/note-structured` on success.
- Update `prompts/vapi-intake-assistant.md` to thread-grounded version.
- Update `src/app/api/voice/start/route.ts` per the diff above.
- Add `<AIConversationThread>` client component to resident detail page.
- Validation: 5 voice notes about a resident over 2 days → thread reflects narrative, `open_questions` populated; call 5 references prior topics. Cost-tracking: ≥80% cache-read ratio.

### Phase 2 — Author generalization (3–4 days, split across two deploys)

- 00031a (additive): `voice_sessions.author_type`, `notes.author_type` (nullable + backfill), `is_staff()` helper.
- Code release: every reader/writer updated to use `author_id` + `author_type`.
- 00031b (NOT NULL flip): once dashboards confirm zero NULL rows in production.
- Validation: full regression — every existing voice call, note creation, share. Behavior unchanged. New columns populated correctly.

### Phase 3 — Clinician accounts + voice + portal (10–12 days)

- Migration `00032_clinician_users.sql` + extend `users_role_check`.
- NPPES NPI client `src/lib/external/npi-pecos.ts`.
- `/api/clinicians/invite` route.
- `src/app/(clinician)/**` portal (dashboard, resident detail filtered by `clinician_clinical_summary`, consult-call launcher).
- `prompts/vapi-clinician-assistant.md` new spec.
- `/api/clinician/voice/start` route.
- Extend `/api/voice/webhook` for author-aware note creation.
- Keep magic-link READ portal at `/portal/clinician/[token]` for one-off shares.
- **Prerequisite**: complete clinician interviews from `docs/research/clinician-interviews-2026-05.md`. If <3 of 5 say they'd sign up, defer Phase 3.
- Validation: test clinician signs up via PECOS-verified flow, assigned to resident, records Vapi consult, thread updates with `author_type='clinician'`.

### Phase 5 — Two-way questions loop (5–7 days)

- Thread updater prompt extended to extract `open_questions` from family/clinician contributions and classify status (`pending` | `addressed`) in subsequent caregiver notes.
- UI: question status badges in clinician thread view.
- Validation: clinician records "Has Mom's appetite improved?" → caregiver's next call surfaces "the clinician asked X" → caregiver answers → clinician sees "addressed" badge.

### Phase 4 — Family accounts + async voice + portal (10–14 days)

- Migration `00033_family_user_links.sql` + `family_voice_memos` with moderation gate.
- Supabase Auth phone provider (Twilio Verify).
- `/api/family/invite` + `/api/family/verify-otp` routes.
- `src/app/(family)/**` portal.
- `/api/family/memos` upload route + `/api/admin/family-memos/[id]/approve` moderation endpoint.
- Multilingual UI surfaces (zh-TW, vi, id, en) — reuse `_shared.ts` cultural-register patterns. Cultural defaults: zh-TW gets daily-comms UX; en gets weekly-digest UX.
- Validation: family receives invite, completes SMS OTP signup, records 1-min memo, admin approves, structured note created with `author_type='family'`, thread updates, family sees `family_safe_summary` view (no raw caregiver notes, no clinical detail).

---

## Critical files to modify (by phase, summary)

**Phase 0a/0b**: `supabase/migrations/00028_*.sql` + `00029_*.sql`; `src/components/residents/capacity-form.tsx`, `recording-consent-form.tsx` (new); `src/app/(dashboard)/residents/[id]/page.tsx`; `src/app/api/voice/start/route.ts` (consent gate); `docs/compliance/{hipaa-roadmap,resident-notification-template,compliance-and-security}.md`.

**Phase 0.5**: `src/lib/claude.ts`; `src/lib/services/structure-note.ts`; `src/lib/prompts/shift-note.ts`; `src/lib/jobs/weekly-summaries.ts`; the 9 other call sites per the caching table.

**Phase 1**: `supabase/migrations/00030_*.sql`; `src/lib/services/structure-note.ts` (event emit); `src/lib/inngest/functions.ts`; `src/lib/jobs/thread-update.ts`, `src/lib/jobs/thread-compaction.ts` (new); `src/lib/prompts/thread-update.ts`, `src/lib/prompts/thread-compact.ts` (new); `prompts/resident-conversation-thread-updater.md`, `prompts/thread-compact.md` (new); `prompts/vapi-intake-assistant.md` (version bump); `src/app/api/voice/start/route.ts` (thread fetch); `src/components/residents/ai-conversation-thread.tsx` (new); `src/app/(dashboard)/residents/[id]/page.tsx`.

**Phase 2**: `supabase/migrations/00031a_*.sql` + `00031b_*.sql`; `src/types/database.ts`; all readers/writers of `voice_sessions.caregiver_id` (rename to `author_id` + `author_type`).

**Phase 3**: `supabase/migrations/00032_*.sql`; `src/lib/external/npi-pecos.ts` (new); `src/app/api/clinicians/invite/route.ts` (new); `src/app/(clinician)/**` (new); `prompts/vapi-clinician-assistant.md` (new); `src/app/api/clinician/voice/start/route.ts` (new); `src/app/api/voice/webhook/route.ts`.

**Phase 5**: `prompts/resident-conversation-thread-updater.md` (version bump); `src/components/family/thread-questions.tsx`, `src/components/clinician/thread-questions.tsx` (new).

**Phase 4**: `supabase/migrations/00033_*.sql`; Supabase Auth phone provider config; `src/app/api/family/{invite,verify-otp}/route.ts` (new); `src/app/(family)/**` (new); `src/app/api/family/memos/route.ts` + `src/app/api/admin/family-memos/[id]/approve/route.ts` (new); `src/components/family/voice-memo-recorder.tsx` (new).

---

## Verification plan

### Per-phase E2E

- **0a**: Mark resident `lacks_capacity`, designate representative, history row appears.
- **0b**: Voice call denied without consent; allowed after capture; denied after withdrawal; denied on jurisdiction mismatch.
- **0.5**: Replay 100 historical calls in dev; ≥40% cost reduction; golden test set passes; cache-read ratio surfaces in metrics.
- **1**: 5 caregiver voice notes over 2 days; thread narrative coherent; call 5 references prior topics; cache-read ratio ≥80% on thread updater after warm-up; CAS conflicts handled (induce by concurrent webhook redelivery).
- **2**: Full regression; behavior unchanged; new columns populated; rolling deploy survives.
- **3**: Test clinician PECOS-verified signup; Vapi consult records; thread updates with `author_type='clinician'`.
- **5**: Clinician question → caregiver call surfaces it → caregiver answers → clinician sees `addressed`.
- **4**: Family SMS-OTP signup; voice memo records; admin approves; structured note appears in family-portal view filtered through `family_safe_summary`.

### Compliance per phase

- `audit_events` row for every voice recording (existing pattern).
- `disclosure_events` for cross-party visibility.
- RLS deny-by-default tested via service-role vs anon-client comparison.
- Consent withdrawal flow stops all downstream access within seconds.

### Cost dashboards (Phase 0.5+)

- Per-org dashboard: `cache_read_ratio`, `tokens_used_per_facility_month`, `cost_per_voice_minute`, broken down by call site. Reuse existing `quota` infrastructure.

---

## Architecture-specific risks (10)

1. **Per-resident concurrency races vs Inngest at-least-once delivery.** Mitigated by `concurrency: {key, limit:1}` + CAS lock + `triggering_note_id` dedupe step.

2. **Hallucination drift across many updates.** Mitigated by (a) compaction prompt re-reading `active_concerns[]` as ground truth, (b) admin "regenerate from scratch" path that replays all structured notes through a rebuild prompt (Sonnet, batched), (c) `thread_versions` rows with diffs for pinpoint blame.

3. **Malformed JSON from Claude.** `parseJsonResponse` strips fences; on failure, increment `update_attempts`, set `last_update_error`, give up after 3. **Prior thread state is NOT overwritten** — voice calls keep grounding on last-good body.

4. **Family-authored memos contaminating clinical baselines.** Defense in depth: prompt rule 8/10/11 + code-side stripping of `baselines` updates when `author_type='family'`.

5. **Cache thrash on prior-body block.** 5-min Anthropic TTL evicts quiet residents. Block 1 + Block 2 still cache. Design optimizes for active resident with multi-party traffic in succession.

6. **Recording-consent jurisdiction mismatch on resident moves.** `voice/start` gate compares `organizations.regulatory_region` to `resident_recording_consents.jurisdiction`; mismatch BLOCKS until re-captured. Restrictive by design.

7. **Phase 2 author rename breaking RLS mid-deploy.** Split into 00031a (additive nullable + backfill) and 00031b (NOT NULL flip) in separate deploys.

8. **PECOS API outage on clinician onboarding.** Explicit `manual_admin_attestation` escape hatch with reason capture; NEVER a silent fallback.

9. **SMS OTP abuse.** Rate-limit `/api/family/invite` 3/day/contact and `/api/family/verify-otp` 6/hour/phone. Captcha after 3 failures.

10. **Compaction blocking updates >2min on slow Claude responses.** Alarm if any thread is locked for >2min; manual unstick path.

---

## Cross-cutting open risks (business / strategic)

1. **Clinician demand unvalidated.** Mitigation: complete clinician interviews BEFORE Phase 3. <3 of 5 say yes → defer Phase 3.

2. **Family adoption uncertainty.** Adult children may not use in-app voice. Mitigation: add SMS-based voicemail input (Twilio number → voicemail webhook → same async pipeline) as alternative — low marginal cost since pipeline already exists.

3. **CIPA + state-law variance.** Two-party states (CA, FL, IL, MA, MD, MT, NH, PA, WA) — `voice_recording_jurisdiction` gate per resident handles this.

4. **Caregiver chilling effect on $249 SKU.** Even with admin-mediated visibility, caregivers may self-censor knowing family will see anything. Mitigation: family-portal UI explicitly labels content as "AI summary"; caregiver onboarding walks through what families see vs. don't.

5. **42 CFR Part 2 in clinician notes.** Substance-use content inherits Part 2 restrictions. Mitigation: clinician portal recording prompt includes banner; structurer flags Part 2 patterns and applies `sensitive_restricted`.

6. **NPI ≠ identity verification.** Mitigated by required dual gate (PECOS + admin attestation).

7. **Multi-language voice mid-call switching.** Daughter speaks English, quotes Mom in Mandarin. Whisper handles code-switching; structuring prompt preserves source-language quotes verbatim (existing pattern).

8. **$249 Vapi tier economics depend on amortizing the BAA across 100+ facilities.** Below that subscriber base, the BAA line dominates. Mitigation: verify against real Vapi contract; consider negotiating a per-minute BAA rate vs flat.

9. **Phase 4 SMS provider lock-in to Supabase Auth phone provider.** If Supabase changes pricing, no easy alternative. Mitigation: abstract the OTP layer behind `src/lib/external/sms-otp.ts` with a swappable provider interface.

10. **The async caregiver path loses within-call follow-up questions.** The rolling thread compensates across sessions, but some clinical detail will be missed in real-time. Mitigation: the structurer prompt should explicitly flag missing details (e.g., "fall mentioned but no location, mechanism, or injury described") that surface in the next session's `open_questions`. The $249 tier is for facilities that need the in-call probe.

---

## Final phase order recap

| # | Phase | Days | Migration | Major files | Status |
|---|---|---|---|---|---|
| **0a** | Decisional capacity | 1–2 | 00028 | capacity-form, residents detail | ✅ Shipped |
| **0b** | Recording consent | 3–5 | 00029 | recording-consent-form, voice/start gate | ✅ Shipped |
| **0.5** | Prompt caching migration | 3–4 | none | claude.ts, structure-note, weekly-summaries, 9 other sites | 🟡 Core shipped (deferred: other sites + Batch + Haiku) |
| **1** | Rolling caregiver thread | 7–10 | 00030 | thread-update job, structure-note event, voice/start, AI thread component | 🟡 Core shipped (deferred: compaction job, UI component, Vapi prompt bump) |
| **2** | Author generalization | 3–4 | 00031a + 00031b | voice_sessions/notes columns, is_staff() helper | ⏳ |
| **3** | Clinician accounts | 10–12 | 00032 | NPI client, clinician portal, vapi-clinician spec | ⏳ |
| **5** | Two-way questions loop | 5–7 | none | thread-updater prompt v2, question status UI | ⏳ |
| **4** | Family accounts + async voice | 10–14 | 00033 | SMS-OTP, family portal, family memo + moderation | ⏳ |
| 6 | (Deferred) Resident self-view | — | — | — | — |

**Total**: ~43–61 days of focused engineering. Phase 0 + Phase 0.5 + Phase 1 + Phase 2 is the minimum-viable thread (15–23 days) that ships internal value without external user onboarding.