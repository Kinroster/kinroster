// Phase 1 thread-update service. Called from the Inngest function on
// `thread/note-structured` events with per-resident concurrency=1.
//
// Flow:
//   1. Load resident + prior thread (or create empty thread).
//   2. Dedupe: if any thread_versions row already references this
//      triggering_note_id, skip — Inngest at-least-once delivery means
//      we may be invoked twice for the same note.
//   3. Call Claude (thread updater prompt) with the 3-block cache
//      structure: system, resident static, prior thread body.
//   4. Parse, validate shape.
//   5. CAS write: UPDATE WHERE id=? AND version=N RETURNING. A 0-row
//      return means another updater ran between our read and write —
//      throw so Inngest retries (which re-reads the latest version).
//   6. Append a thread_versions row with the new body + telemetry.
//   7. If approx token count > 3000, emit a compaction event (handled
//      by a sibling Inngest function — wired in a follow-up).
//
// Failure semantics: on parse failure / 3 consecutive Claude failures,
// flip update_giving_up=true and keep the prior body intact. Voice
// calls keep grounding on last-good; admin UI shows "thread stale".

import { createAdminClient } from "@/lib/supabase/admin";
import {
  callClaudeWithUsage,
  parseJsonResponse,
  type ClaudeUsage,
} from "@/lib/claude";
import {
  THREAD_UPDATE_SYSTEM_PROMPT,
  EMPTY_THREAD_BODY,
  approximateTokens,
  buildThreadUpdatePromptParts,
  isThreadBodyShape,
  threadBodyOrEmpty,
  type ThreadBody,
} from "@/lib/prompts/thread-update";
import type { Json } from "@/types/database";

function toJson(body: ThreadBody): Json {
  return body as unknown as Json;
}

export const MAX_THREAD_UPDATE_ATTEMPTS = 3;

export interface ThreadUpdateInput {
  noteId: string;
  residentId: string;
  organizationId: string;
}

export interface ThreadUpdateResult {
  success: boolean;
  skipped?: "already_applied";
  error?: string;
  retryable: boolean;
  newVersion?: number;
  approximateTokenCount?: number;
}

interface NoteRow {
  id: string;
  created_at: string;
  raw_input: string;
  structured_output: string | null;
  author_id: string;
  residents:
    | {
        first_name: string;
        last_name: string;
        conditions: string | null;
        care_notes_context: string | null;
      }
    | null;
}

interface ThreadRow {
  id: string;
  version: number;
  body: unknown;
  update_attempts: number;
}

type AuthorType = "caregiver" | "admin" | "clinician" | "family";

function authorTypeFromRole(role: string | null | undefined): AuthorType {
  switch (role) {
    case "admin":
    case "compliance_admin":
      return "admin";
    case "clinician":
      return "clinician";
    case "family":
      return "family";
    default:
      return "caregiver";
  }
}

export async function updateThreadFromStructuredNote(
  input: ThreadUpdateInput
): Promise<ThreadUpdateResult> {
  const admin = createAdminClient();

  // 1. Load the note + resident in one round-trip.
  const { data: noteData } = await admin
    .from("notes")
    .select(
      "id, created_at, raw_input, structured_output, author_id, residents(first_name, last_name, conditions, care_notes_context)"
    )
    .eq("id", input.noteId)
    .single();
  const note = noteData as NoteRow | null;
  if (!note) {
    return {
      success: false,
      error: "Note not found",
      retryable: false,
    };
  }
  if (!note.structured_output) {
    return {
      success: false,
      error: "Note has no structured_output yet",
      retryable: true,
    };
  }
  if (!note.residents) {
    return {
      success: false,
      error: "Resident not found",
      retryable: false,
    };
  }

  // 2. Get or create the thread row.
  let thread: ThreadRow;
  const { data: existingThread } = await admin
    .from("resident_conversation_threads")
    .select("id, version, body, update_attempts")
    .eq("resident_id", input.residentId)
    .maybeSingle();

  if (existingThread) {
    thread = existingThread as ThreadRow;
  } else {
    const { data: created, error: createError } = await admin
      .from("resident_conversation_threads")
      .insert({
        organization_id: input.organizationId,
        resident_id: input.residentId,
        version: 0,
        body: toJson(EMPTY_THREAD_BODY),
        approximate_token_count: approximateTokens(EMPTY_THREAD_BODY),
      })
      .select("id, version, body, update_attempts")
      .single();
    if (createError || !created) {
      return {
        success: false,
        error: `Failed to create thread: ${createError?.message ?? "unknown"}`,
        retryable: true,
      };
    }
    thread = created as ThreadRow;
  }

  // 3. Dedupe: skip if a prior run already applied this note.
  const { count: dupCount } = await admin
    .from("resident_conversation_thread_versions")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", thread.id)
    .eq("triggering_note_id", note.id);
  if ((dupCount ?? 0) > 0) {
    return {
      success: true,
      skipped: "already_applied",
      retryable: false,
      newVersion: thread.version,
    };
  }

  // 4. Resolve author info.
  const { data: authorRow } = await admin
    .from("users")
    .select("full_name, role")
    .eq("id", note.author_id)
    .single();
  const author = authorRow as
    | { full_name: string | null; role: string | null }
    | null;
  const authorName = author?.full_name || "Unknown";
  const authorType = authorTypeFromRole(author?.role);

  // 5. Parse the note's structured_output.
  let newNoteStructured: unknown;
  try {
    newNoteStructured = JSON.parse(note.structured_output);
  } catch {
    return {
      success: false,
      error: "Note structured_output is not valid JSON",
      retryable: false,
    };
  }

  const priorBody: ThreadBody = threadBodyOrEmpty(thread.body as never);

  const { residentStaticBlock, priorThreadBlock, volatileTail } =
    buildThreadUpdatePromptParts({
      residentFirstName: note.residents.first_name,
      residentLastName: note.residents.last_name,
      conditions: note.residents.conditions,
      careNotesContext: note.residents.care_notes_context,
      priorBody,
      newNoteStructured,
      newNoteRawExcerpt: note.raw_input,
      newNoteCreatedAt: note.created_at,
      newNoteAuthorName: authorName,
      newNoteAuthorType: authorType,
    });

  // 6. Call Claude with the 3-block cache structure.
  let usage: ClaudeUsage;
  let updatedBody: ThreadBody;
  try {
    const { text, usage: u } = await callClaudeWithUsage({
      model: "claude-haiku-4-5",
      systemPrompt: THREAD_UPDATE_SYSTEM_PROMPT,
      systemPromptSuffix: residentStaticBlock,
      userPromptCachedPrefix: priorThreadBlock,
      userPrompt: volatileTail,
      cacheTtl: "5m",
      maxTokens: 2048,
    });
    usage = u;
    const parsed = parseJsonResponse<unknown>(text);
    if (!isThreadBodyShape(parsed)) {
      throw new Error("Claude returned malformed thread body shape");
    }
    updatedBody = parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = thread.update_attempts + 1;
    const giveUp = nextAttempts >= MAX_THREAD_UPDATE_ATTEMPTS;
    await admin
      .from("resident_conversation_threads")
      .update({
        update_attempts: nextAttempts,
        last_update_error: message,
        update_giving_up: giveUp,
      })
      .eq("id", thread.id);
    return {
      success: false,
      error: message,
      retryable: !giveUp,
    };
  }

  // 7. CAS write: only succeed if the row hasn't been updated since
  // our read. A 0-row return means another updater ran in parallel —
  // surface as retryable so Inngest re-runs.
  const newVersion = thread.version + 1;
  const newTokenCount = approximateTokens(updatedBody);
  const { data: updated, error: casError } = await admin
    .from("resident_conversation_threads")
    .update({
      version: newVersion,
      body: toJson(updatedBody),
      approximate_token_count: newTokenCount,
      last_note_id: note.id,
      last_updated_at: new Date().toISOString(),
      last_model_used: "claude-haiku-4-5",
      update_attempts: 0,
      last_update_error: null,
      update_giving_up: false,
    })
    .eq("id", thread.id)
    .eq("version", thread.version)
    .select("id")
    .single();

  if (casError || !updated) {
    return {
      success: false,
      error: "thread_version_conflict",
      retryable: true,
    };
  }

  // 8. Append the new version row (audit + cost telemetry).
  await admin
    .from("resident_conversation_thread_versions")
    .insert({
      thread_id: thread.id,
      organization_id: input.organizationId,
      resident_id: input.residentId,
      version: newVersion,
      body: toJson(updatedBody),
      approximate_token_count: newTokenCount,
      trigger: "note_insert",
      triggering_note_id: note.id,
      model_used: "claude-haiku-4-5",
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
    });

  return {
    success: true,
    retryable: false,
    newVersion,
    approximateTokenCount: newTokenCount,
  };
}
