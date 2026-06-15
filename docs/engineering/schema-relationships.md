# Schema Relationships

Generated from `src/types/database.ts` and migration files.  
Last updated: 2026-06-14

---

## Core Hierarchy

```
organizations
  ├── users                          (organization_id)
  ├── residents                      (organization_id)
  ├── clinicians                     (organization_id)
  ├── notes                          (organization_id)
  ├── voice_sessions                 (organization_id)
  ├── care_tasks                     (organization_id)
  ├── incident_reports               (organization_id)
  ├── family_communications          (organization_id)
  ├── weekly_summaries               (organization_id)
  ├── audit_events                   (organization_id)
  ├── disclosure_events              (organization_id)
  ├── consent_records                (organization_id)
  ├── deletion_ledger                (organization_id)
  ├── clinician_share_links          (organization_id)
  └── family_contact_confirmation_tokens (organization_id)
```

---

## Table-by-Table Reference

### `organizations`
Root tenant table. Every row in the system belongs to one org.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | text | Facility name |
| type | text | `rcfe`, `home_care`, `other` |
| timezone | text | IANA tz string |
| subscription_status | text | `trial`, `active`, `past_due`, `canceled` |
| subscription_tier | text | Generated column |
| trial_ends_at | timestamptz | |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| regulatory_region | text | Drives PDPA / consent variants |
| default_clinical_language | text | |
| default_output_language | text | |

**No foreign keys — root of the hierarchy.**

---

### `users`
Staff accounts. Mirrors `auth.users` (same UUID).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | = auth.uid() |
| organization_id | UUID → organizations | |
| email | text | |
| full_name | text | |
| role | text | `admin`, `caregiver`, `nurse_reviewer`, `ops_staff`, `billing_staff`, `compliance_admin` |
| is_active | boolean | |
| preferred_language | text | |
| secondary_languages | text[] | |

**Referenced by:** notes, voice_sessions, care_tasks, incident_reports, weekly_summaries, caregiver_assignments, family_communications, clinician_share_links, clinician_questions, audit_events, disclosure_events, notes_sensitive_access, consent_records, deletion_ledger, resident_pdpa_consents, family_contact_pdpa_consents, resident_recording_consents, resident_decisional_capacity, family_user_links, family_voice_memos

---

### `residents`
People receiving care. The central clinical subject.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| first_name, last_name | text | |
| date_of_birth | date | |
| room_number | text | |
| status | text | `active`, `discharged`, `deceased` |
| conditions | text | Free-text medical context |
| preferences | text | Care preferences |
| care_notes_context | text | Injected into AI prompts |
| preferred_language | text | |
| cultural_taboos, dietary_restrictions | text[] | |
| decisional_capacity | → resident_decisional_capacity | 1:1 |

**Referenced by:** notes, voice_sessions, care_tasks, incident_reports, family_contacts, weekly_summaries, family_communications, caregiver_assignments, clinician_share_links, clinician_questions, resident_clinicians, disclosure_events, deletion_ledger, resident_pdpa_consents, family_contact_pdpa_consents (via family_contacts), resident_recording_consents, resident_conversation_threads, resident_decisional_capacity, resident_recording_consents, family_user_links (via family_contacts)

---

### `notes`
The core clinical documentation unit. Created from voice sessions or directly.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| author_id | UUID → users | |
| author_type | text | `user`, `clinician` |
| note_type | text | `shift_note`, `incident`, `observation`, `summary` |
| raw_input | text | Original voice transcript / text |
| structured_output | text | AI-structured JSON |
| is_structured | boolean | |
| flagged_as_incident | boolean | Auto-detected |
| manually_flagged | boolean | |
| sensitive_flag | boolean | 42 CFR Part 2 |
| sensitive_category | text | e.g. `substance_use` |
| shift | text | `morning`, `afternoon`, `night` |

**References:** users (author), residents, organizations  
**Referenced by:** incident_reports, family_communications (source_note_ids), weekly_summaries (source_note_ids), voice_sessions (note_id), resident_conversation_thread_versions (triggering_note_id), family_voice_memos (note_id)

---

### `voice_sessions`
Records each AI voice call between a caregiver and the Vapi/voice assistant.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| caregiver_id | UUID → users | |
| author_id | UUID → users/clinicians | |
| call_type | text | `intake`, `follow_up`, etc. |
| status | text | `initiated`, `active`, `completed`, `failed` |
| vapi_call_id | text | External Vapi identifier |
| note_id | UUID → notes | Produced note |
| full_transcript | text | |
| duration_seconds | integer | |

**References:** users (caregiver), residents, organizations, notes (output)  
**Referenced by:** voice_transcripts, care_tasks (source_voice_session_id)

---

### `voice_transcripts`
Line-by-line transcript turns for a voice session.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| session_id | UUID → voice_sessions | |
| role | text | `user`, `assistant` |
| text | text | |
| offset_ms | integer | |

---

### `care_tasks`  *(added migration 00034)*
Tasks assigned to caregivers. Can be created manually or flagged by AI from voice calls.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents (nullable) | |
| assigned_to | UUID → users (nullable) | |
| created_by | UUID → users | |
| title | text | |
| description | text | |
| due_date | date | Shown on calendar |
| due_time | time | |
| priority | text | `low`, `normal`, `high`, `urgent` |
| status | text | `pending`, `in_progress`, `completed`, `cancelled` |
| source | text | `manual`, `voice_call` |
| source_voice_session_id | UUID → voice_sessions (nullable) | Set when AI flags an action item |
| completed_at | timestamptz | |
| completed_by | UUID → users (nullable) | |

**Key pattern:** When a voice call ends, the AI can flag action items → new rows with `source = 'voice_call'` and `source_voice_session_id` pointing back to the call.

---

### `incident_reports`
Formal incident documentation linked to a note.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| note_id | UUID → notes | Source note |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| incident_type | text | |
| severity | text | `low`, `medium`, `high` |
| status | text | `open`, `reviewed`, `closed` |
| reviewed_by | UUID → users (nullable) | |
| mandatory_report_required | boolean | |
| mandatory_report_submitted_at | timestamptz | |
| follow_up_date | date | |

---

### `family_contacts`
Family members or representatives tied to a resident.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| resident_id | UUID → residents | |
| name | text | |
| relationship | text | |
| is_primary | boolean | |
| receives_updates | boolean | |
| personal_representative | boolean | Legal representative |
| authorization_scope | text[] | What PHI they can receive |

**Referenced by:** family_communications, family_contact_confirmation_tokens, family_contact_pdpa_consents, family_user_links

---

### `family_user_links`
Links a family member's app account (user) to a family_contact record.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| user_id | UUID → users | The family member's login |
| family_contact_id | UUID → family_contacts | |
| link_status | text | `pending`, `active`, `revoked` |
| invited_by_user_id | UUID → users | Staff who sent invite |
| phone_at_verification | text | |
| verification_method | text | |

**Referenced by:** family_voice_memos

---

### `family_voice_memos`
Audio messages from family members, moderated before becoming notes.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| family_user_link_id | UUID → family_user_links | |
| uploaded_by_user_id | UUID → users | |
| moderation_status | text | `pending`, `approved`, `rejected` |
| transcript | text | |
| note_id | UUID → notes (nullable) | Set after approval |

---

### `clinicians`
External healthcare providers (physicians, therapists).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| full_name, email, phone | text | |
| specialty | text | |
| npi | text | National Provider Identifier |
| clinical_language | text | |

**Referenced by:** resident_clinicians, clinician_share_links, clinician_questions

---

### `resident_clinicians`
Many-to-many join: which clinicians are assigned to which residents.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| resident_id | UUID → residents | |
| clinician_id | UUID → clinicians | |
| relationship | text | e.g. `primary_physician` |
| is_primary | boolean | |

---

### `clinician_share_links`
Revocable magic links granting a clinician time-limited read access.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| clinician_id | UUID → clinicians | |
| created_by | UUID → users | Staff who generated link |
| token_hash | text | bcrypt hash of the token |
| expires_at | timestamptz | |
| revoked_at | timestamptz | |
| rendered_summary | jsonb | Snapshot of data at share time |
| share_scope | jsonb | Which fields/sections included |
| open_count | integer | |

**Referenced by:** clinician_questions, disclosure_events

---

### `clinician_questions`
Questions a clinician submits via their share link; caregiver responds.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| share_link_id | UUID → clinician_share_links (1:1) | |
| resident_id | UUID → residents | |
| organization_id | UUID → organizations | |
| question_text_source | text | In clinician's language |
| question_text_translated | text | Translated for caregiver |
| caregiver_response_text | text | |
| responded_by_user_id | UUID → users | |

---

### `weekly_summaries`
AI-generated weekly care summaries per resident.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| week_start, week_end | date | |
| summary_text | text | |
| key_trends | text[] | |
| concerns | text[] | |
| incidents_count | integer | |
| source_note_ids | uuid[] | Notes used to generate |
| status | text | `pending_review`, `approved`, `regenerating` |
| reviewed_by | UUID → users (nullable) | |

**Unique constraint:** `(resident_id, week_start)`

---

### `family_communications`
Emails/messages sent to family contacts, sourced from notes.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| generated_by | UUID → users | |
| recipient_contact_id | UUID → family_contacts | |
| source_note_ids | uuid[] | |
| status | text | `draft`, `sent`, `failed` |
| approved_by | UUID → users (nullable) | |

---

### `audit_events`
Append-only compliance ledger for all sensitive operations.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| user_id | UUID → users (nullable) | |
| event_type | text | e.g. `note.view`, `share_link.create` |
| object_type | text | Table name of affected row |
| object_id | UUID | PK of affected row |
| result | text | `success`, `denied` |
| ip_address | text | |
| metadata | jsonb | Extra context |

---

### `disclosure_events`
Tracks every PHI disclosure (sharing to clinician, family, export).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| organization_id | UUID → organizations | |
| resident_id | UUID → residents | |
| actor_user_id | UUID → users | |
| recipient_type | text | `clinician`, `family`, `export`, `regulator` |
| recipient_id | UUID (nullable) | FK to clinician or family_contact |
| delivery_method | text | `share_link`, `email`, `download` |
| legal_basis | text | e.g. `consent`, `treatment`, `mandatory_report` |
| sensitive_override | boolean | Was Part 2 data included? |
| categories_shared | text[] | |
| source_note_ids | text[] | |
| share_link_id | UUID → clinician_share_links (nullable) | |

---

### Consent Tables

| Table | Subject | Linked To |
|-------|---------|-----------|
| `consent_records` | Staff/user consent (TOS, data use) | users |
| `resident_pdpa_consents` | Resident PDPA/HIPAA consent | residents |
| `family_contact_pdpa_consents` | Family PDPA consent | family_contacts |
| `resident_recording_consents` | Consent for voice recording | residents |

All share the same structure: `consent_text_snapshot`, `signed_typed_name`, `consenting_party_*`, `withdrawn_at`.

---

### `resident_decisional_capacity`
One-to-one: current capacity assessment for a resident.

| Column | Notes |
|--------|-------|
| capacity_status | `full`, `partial`, `lacking` |
| representative_name | If lacking capacity |
| authority_basis | `power_of_attorney`, `court_order`, etc. |
| next_review_due_at | When to re-assess |

**Referenced by:** `resident_decisional_capacity_history` (tracks all changes via trigger)

---

### `resident_conversation_threads`
Running AI context window for a resident — used to keep Claude informed across sessions.

| Column | Notes |
|--------|-------|
| body | jsonb — the current conversation state |
| version | Increments on each update |
| approximate_token_count | For compaction decisions |
| last_note_id | Last note that updated the thread |

**Referenced by:** `resident_conversation_thread_versions` (snapshot of each version with diff and token usage)

---

### `notes_sensitive_access`
Temporary grants allowing a user to view a resident's Part 2 (sensitive) notes.

| Column | Notes |
|--------|-------|
| user_id | UUID → users |
| resident_id | UUID → residents |
| granted_by | UUID → users |
| reason | text |
| expires_at | timestamptz |

---

### `caregiver_assignments`
Explicit assignment of a caregiver to a resident for a date range.

| Column | Notes |
|--------|-------|
| caregiver_id | UUID → users |
| resident_id | UUID → residents |
| created_by | UUID → users |
| start_date / end_date | date range |

---

### `deletion_ledger`
Tombstone record when a resident is deleted. Retains a name hash for regulatory proof without keeping PHI.

---

### `stripe_processed_events`
Idempotency table for Stripe webhook events.

---

## Relationship Diagram (text)

```
organizations ──< users
             ──< residents ──< notes ──< incident_reports
             |               |       └── voice_sessions ──< voice_transcripts
             |               |       └── care_tasks (source_voice_session_id → voice_sessions)
             |               ├──< family_contacts ──< family_user_links ──< family_voice_memos
             |               ├──< weekly_summaries
             |               ├──< family_communications
             |               ├──< caregiver_assignments
             |               ├──< resident_clinicians >── clinicians ──< clinician_share_links
             |               ├──< clinician_questions (via share_link)
             |               ├──< consent records (3 tables)
             |               ├──< resident_decisional_capacity ──< _history
             |               └──< resident_conversation_threads ──< _versions
             ├──< care_tasks
             ├──< audit_events
             ├──< disclosure_events
             └──< deletion_ledger
```

---

## RLS Function Reference

| Function | Returns | Description |
|----------|---------|-------------|
| `get_user_org_id()` | UUID | Current user's organization_id |
| `is_admin()` | boolean | role IN ('admin', 'compliance_admin') |
| `is_staff()` | boolean | role not in ('ops_staff', 'billing_staff') — all clinical roles |
| `has_role(p_role)` | boolean | Exact role match |
| `count_hidden_sensitive_notes(p_resident_id)` | integer | Sensitive notes the caller cannot see |
