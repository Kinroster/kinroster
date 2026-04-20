-- Phase 3: surface sensitive-data flags at the row level so RLS in Phase 4
-- can key off them without parsing structured_output JSON. The structurer
-- writes both the in-JSON fields (for the UI) and these columns (for RLS
-- and indexed queries). Existing rows default to false / null.

ALTER TABLE notes
  ADD COLUMN sensitive_flag BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sensitive_category TEXT;

-- Partial index — most notes are not sensitive, so we only want to pay the
-- index cost on the small set that matter for RLS and sensitive queries.
CREATE INDEX idx_notes_sensitive ON notes (organization_id, resident_id)
  WHERE sensitive_flag = true;
