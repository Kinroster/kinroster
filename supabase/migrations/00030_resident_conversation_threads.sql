-- Phase 1: per-resident rolling AI conversation thread.
--
-- One thread per resident — the unified record that EVERY voice call /
-- text note about the resident reads from and writes to. Replaces the
-- "stitch last 5 notes + 14 days incidents" grounding in voice/start
-- with a single coherent narrative + structured slices the LLM
-- maintains across sessions and parties.
--
-- See docs/engineering/resident-conversation-thread-plan.md for the
-- architectural shape (CAS optimistic locking, per-resident Inngest
-- concurrency, 3-block prompt cache).

CREATE TABLE resident_conversation_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,

  -- Compare-and-swap version for optimistic locking. The updater reads
  -- version N, computes N+1, and writes WHERE id=? AND version=?. A
  -- 0-row return signals a concurrent update — the caller (Inngest
  -- function) retries by re-reading the latest version and re-running
  -- the prompt with the merged prior state.
  version INTEGER NOT NULL DEFAULT 0,

  -- The thread body. Shape (see thread-update prompt for the contract):
  --   { schema_version, narrative, active_concerns[], baselines{},
  --     recent_incidents[], follow_ups_open[], open_questions[],
  --     family_safe_summary, clinician_clinical_summary,
  --     notes_consumed_count }
  body JSONB NOT NULL DEFAULT '{}',

  -- Best-effort token count of the body, used to trigger compaction.
  -- Partial index below makes the compaction queue cheap to scan.
  approximate_token_count INTEGER NOT NULL DEFAULT 0,

  -- Bookkeeping for the updater + the cron that watches for staleness.
  last_note_id UUID,
  last_updated_at TIMESTAMPTZ,
  last_compacted_at TIMESTAMPTZ,
  last_model_used TEXT,

  -- Updater failure tracking. Mirrors the notes.structuring_giving_up
  -- pattern: prior body is NEVER overwritten on failure, voice calls
  -- keep grounding on last-good, admin UI shows a "thread stale" badge
  -- once update_giving_up flips true.
  update_attempts INTEGER NOT NULL DEFAULT 0,
  last_update_error TEXT,
  update_giving_up BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (resident_id)
);

CREATE INDEX idx_thread_org
  ON resident_conversation_threads (organization_id);

-- Compaction queue: any thread over 3000 approx tokens whose last
-- compaction is older than 6h is eligible for a compaction job.
CREATE INDEX idx_thread_compaction_queue
  ON resident_conversation_threads (organization_id, last_compacted_at)
  WHERE approximate_token_count > 3000;

-- Stale-thread monitor: surface threads that haven't updated despite
-- new notes (the updater gave up).
CREATE INDEX idx_thread_stale
  ON resident_conversation_threads (organization_id)
  WHERE update_giving_up = TRUE;

ALTER TABLE resident_conversation_threads ENABLE ROW LEVEL SECURITY;

-- Org staff read threads. WRITES are restricted to service-role
-- (Inngest function uses createAdminClient) — no INSERT/UPDATE/DELETE
-- policy means no user-facing write path.
CREATE POLICY "Org users read threads"
  ON resident_conversation_threads FOR SELECT
  USING (organization_id = get_user_org_id());

CREATE TRIGGER set_updated_at_resident_conversation_threads
  BEFORE UPDATE ON resident_conversation_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- Append-only version history
-- =====================================================
CREATE TABLE resident_conversation_thread_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES resident_conversation_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,

  version INTEGER NOT NULL,
  body JSONB NOT NULL,
  approximate_token_count INTEGER NOT NULL DEFAULT 0,

  trigger TEXT NOT NULL
    CHECK (trigger IN ('note_insert', 'compaction', 'manual_regenerate')),
  triggering_note_id UUID,
  -- Optional diff captured at write time (not replayed at read time);
  -- expensive to compute at scale, useful for audits and admin "what
  -- changed" surfaces.
  diff JSONB,

  -- Cost telemetry sourced from Anthropic's usage object on the
  -- thread-update call. Lets us build per-resident / per-org cost
  -- dashboards and verify the 3-block cache hit rate in production.
  model_used TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_input_tokens INTEGER,
  cache_creation_input_tokens INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (thread_id, version)
);

CREATE INDEX idx_thread_versions_resident_created
  ON resident_conversation_thread_versions (resident_id, created_at DESC);
CREATE INDEX idx_thread_versions_triggering_note
  ON resident_conversation_thread_versions (triggering_note_id)
  WHERE triggering_note_id IS NOT NULL;

ALTER TABLE resident_conversation_thread_versions ENABLE ROW LEVEL SECURITY;

-- Admins read full version history. No INSERT/UPDATE/DELETE policy →
-- append-only via service-role only.
CREATE POLICY "Admins read thread versions"
  ON resident_conversation_thread_versions FOR SELECT
  USING (organization_id = get_user_org_id() AND is_admin());

-- =====================================================
-- Additive: voice_sessions.author_id (Phase 2 prerequisite)
-- =====================================================
-- Phase 2 will generalize caregiver_id → author_id + author_type to let
-- clinicians and family contribute. Adding the nullable column here
-- removes a Phase 3 blocker; backfill + NOT-NULL flip happen in 00031.
ALTER TABLE voice_sessions
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_author
  ON voice_sessions (author_id)
  WHERE author_id IS NOT NULL;
