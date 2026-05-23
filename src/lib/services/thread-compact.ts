// Phase 1 follow-up: thread compaction service.
//
// Sibling to thread-update.ts. Triggered by the Inngest event
// `thread/compaction-requested` when a thread's approximate_token_count
// crosses 3000. Same per-resident concurrency: 1 key as the updater, so
// compaction queues behind any in-flight update for the same resident.
//
// Anti-loop guard: a thread is only compactable if last_compacted_at IS
// NULL OR last_compacted_at < now() - interval '6 hours'. Without this,
// a chronically-large thread (Claude returns a still-large body after
// compaction) would loop forever.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  callClaudeWithUsage,
  parseJsonResponse,
} from "@/lib/claude";
import {
  approximateTokens,
  isThreadBodyShape,
  threadBodyOrEmpty,
  type ThreadBody,
} from "@/lib/prompts/thread-update";
import {
  THREAD_COMPACT_SYSTEM_PROMPT,
  buildThreadCompactPromptParts,
} from "@/lib/prompts/thread-compact";
import type { Json } from "@/types/database";

const COMPACTION_COOLDOWN_HOURS = 6;

function toJson(body: ThreadBody): Json {
  return body as unknown as Json;
}

export interface CompactThreadInput {
  threadId: string;
  residentId: string;
  organizationId: string;
}

export interface CompactThreadResult {
  success: boolean;
  skipped?: "cooldown" | "already_small";
  error?: string;
  retryable: boolean;
  newVersion?: number;
  approximateTokenCount?: number;
}

interface ThreadRow {
  id: string;
  version: number;
  body: unknown;
  approximate_token_count: number;
  last_compacted_at: string | null;
  resident_id: string;
  organization_id: string;
}

export async function compactThread(
  input: CompactThreadInput
): Promise<CompactThreadResult> {
  const admin = createAdminClient();

  // 1. Load the current thread row.
  const { data: threadData } = await admin
    .from("resident_conversation_threads")
    .select(
      "id, version, body, approximate_token_count, last_compacted_at, resident_id, organization_id"
    )
    .eq("id", input.threadId)
    .single();
  const thread = threadData as ThreadRow | null;
  if (!thread) {
    return {
      success: false,
      error: "Thread not found",
      retryable: false,
    };
  }

  // 2. Anti-loop guard.
  if (thread.last_compacted_at) {
    const last = new Date(thread.last_compacted_at).getTime();
    const cutoff =
      Date.now() - COMPACTION_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (last > cutoff) {
      return {
        success: true,
        skipped: "cooldown",
        retryable: false,
      };
    }
  }

  // 3. Sanity: if the body is already under threshold, skip.
  const priorBody = threadBodyOrEmpty(thread.body as never);
  if (thread.approximate_token_count <= 3000) {
    return {
      success: true,
      skipped: "already_small",
      retryable: false,
    };
  }

  // 4. Load resident for the cached static block.
  const { data: residentRow } = await admin
    .from("residents")
    .select("first_name, last_name")
    .eq("id", thread.resident_id)
    .single();
  const resident = residentRow as
    | { first_name: string; last_name: string }
    | null;
  if (!resident) {
    return {
      success: false,
      error: "Resident not found",
      retryable: false,
    };
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const { residentStaticBlock, volatileTail } =
    buildThreadCompactPromptParts({
      residentFirstName: resident.first_name,
      residentLastName: resident.last_name,
      currentBody: priorBody,
      todayIso,
    });

  // 5. Call Claude.
  let compactedBody: ThreadBody;
  let usage;
  try {
    const { text, usage: u } = await callClaudeWithUsage({
      model: "claude-haiku-4-5",
      systemPrompt: THREAD_COMPACT_SYSTEM_PROMPT,
      systemPromptSuffix: residentStaticBlock,
      userPrompt: volatileTail,
      cacheTtl: "5m",
      maxTokens: 2048,
    });
    usage = u;
    const parsed = parseJsonResponse<unknown>(text);
    if (!isThreadBodyShape(parsed)) {
      throw new Error("Claude returned malformed thread body shape");
    }
    compactedBody = parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
      // Compaction failures are NOT retried at the updater level —
      // failing to compact doesn't break voice/start (it just keeps
      // running with the larger body). Inngest's function-level
      // retries: 1 setting handles transient errors.
      retryable: true,
    };
  }

  // 6. Defense in depth: preserve structured slices from the prior body
  // verbatim. Prompt rule 1-4 already requires this, but if Claude
  // accidentally drops an active concern during summarisation we silently
  // restore it. We trust the compacted narrative + recomputed summaries.
  const safeBody: ThreadBody = {
    ...compactedBody,
    active_concerns: priorBody.active_concerns,
    baselines: priorBody.baselines,
    follow_ups_open: priorBody.follow_ups_open,
    open_questions: priorBody.open_questions,
  };

  // 7. CAS write — fail open on conflict (an updater landed first;
  // compaction can re-fire later via the next note insert).
  const newVersion = thread.version + 1;
  const newTokenCount = approximateTokens(safeBody);
  const nowIso = new Date().toISOString();
  const { data: updated, error: casError } = await admin
    .from("resident_conversation_threads")
    .update({
      version: newVersion,
      body: toJson(safeBody),
      approximate_token_count: newTokenCount,
      last_compacted_at: nowIso,
      last_updated_at: nowIso,
      last_model_used: "claude-haiku-4-5",
    })
    .eq("id", thread.id)
    .eq("version", thread.version)
    .select("id")
    .single();

  if (casError || !updated) {
    return {
      success: false,
      error: "thread_version_conflict_at_compaction",
      retryable: true,
    };
  }

  // 8. Append the new version row.
  await admin.from("resident_conversation_thread_versions").insert({
    thread_id: thread.id,
    organization_id: thread.organization_id,
    resident_id: thread.resident_id,
    version: newVersion,
    body: toJson(safeBody),
    approximate_token_count: newTokenCount,
    trigger: "compaction",
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
