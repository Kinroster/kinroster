import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVapiWebhook } from "@/lib/vapi";
import type { Json } from "@/types/database";

// Vapi tool-call endpoint. Each tool in the Vapi dashboard points its
// server.url here. Vapi POSTs when the assistant decides to call a tool
// during a live conversation and expects a `results` array back before
// it continues speaking.
//
// Tools supported:
//   create_task     — creates a care_tasks row immediately
//   flag_incident   — queues an incident in session metadata; the
//                     end-of-call webhook creates the incident_report
//                     once the note exists
//   log_symptom     — queues a symptom observation in session metadata;
//                     end-of-call webhook includes it in processing

interface VapiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface VapiToolCallMessage {
  type: "tool-calls";
  toolCallList: VapiToolCall[];
  call: {
    id: string;
    metadata?: Record<string, string>;
    assistantOverrides?: { metadata?: Record<string, string> };
  };
}

function getSessionId(call: VapiToolCallMessage["call"]): string | null {
  return (
    call.assistantOverrides?.metadata?.sessionId ??
    call.metadata?.sessionId ??
    null
  );
}

// Fuzzy resident lookup within an org by name. Tries exact match first,
// then falls back to first-name-only if no full match is found.
async function findResident(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  name: string
): Promise<{ id: string; first_name: string; last_name: string } | null> {
  const trimmed = name.trim();
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  // Try full name match first
  if (lastName) {
    const { data } = await supabase
      .from("residents")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(1)
      .single();
    if (data) return data as { id: string; first_name: string; last_name: string };
  }

  // Fall back to first name only
  const { data } = await supabase
    .from("residents")
    .select("id, first_name, last_name")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .ilike("first_name", firstName)
    .limit(1)
    .single();

  return data as { id: string; first_name: string; last_name: string } | null;
}

// ── Tool handlers ────────────────────────────────────────────────────────────

interface CreateTaskArgs {
  title: string;
  resident_name?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  due_date?: string;
  description?: string;
}

async function handleCreateTask(
  supabase: ReturnType<typeof createAdminClient>,
  session: { id: string; organization_id: string; caregiver_id: string; resident_id: string | null },
  args: CreateTaskArgs
): Promise<string> {
  let residentId = session.resident_id ?? null;

  // If the AI passed a resident name and session doesn't already have one,
  // try to look them up.
  if (!residentId && args.resident_name) {
    const resident = await findResident(
      supabase,
      session.organization_id,
      args.resident_name
    );
    residentId = resident?.id ?? null;
  }

  const { error } = await supabase.from("care_tasks").insert({
    organization_id: session.organization_id,
    created_by: session.caregiver_id,
    resident_id: residentId,
    title: args.title,
    description: args.description ?? null,
    priority: args.priority ?? "normal",
    due_date: args.due_date ?? null,
    status: "pending",
    source: "voice_call",
    source_voice_session_id: session.id,
  });

  if (error) {
    return `Failed to create task: ${error.message}`;
  }

  return `Task created: "${args.title}"${args.due_date ? ` due ${args.due_date}` : ""}`;
}

interface FlagIncidentArgs {
  description: string;
  resident_name?: string;
  severity?: "low" | "medium" | "high";
  incident_type?: string;
}

async function handleFlagIncident(
  supabase: ReturnType<typeof createAdminClient>,
  session: { id: string; organization_id: string; resident_id: string | null },
  args: FlagIncidentArgs
): Promise<string> {
  let residentId = session.resident_id ?? null;

  if (!residentId && args.resident_name) {
    const resident = await findResident(
      supabase,
      session.organization_id,
      args.resident_name
    );
    residentId = resident?.id ?? null;
  }

  if (!residentId) {
    return "Incident noted, but I couldn't identify the resident. Please clarify who this incident is for.";
  }

  // Append to session metadata — the end-of-call webhook will create the
  // formal incident_report once the note row exists.
  const { data: sessionRow } = await supabase
    .from("voice_sessions")
    .select("metadata")
    .eq("id", session.id)
    .single();

  const existing = (sessionRow as { metadata: Record<string, unknown> | null } | null)
    ?.metadata ?? {};

  const pendingIncidents: unknown[] = Array.isArray(existing.pending_incidents)
    ? (existing.pending_incidents as unknown[])
    : [];

  pendingIncidents.push({
    resident_id: residentId,
    description: args.description,
    severity: args.severity ?? "medium",
    incident_type: args.incident_type ?? "general",
    flagged_at: new Date().toISOString(),
  });

  await supabase
    .from("voice_sessions")
    .update({ metadata: { ...existing, pending_incidents: pendingIncidents } as Json })
    .eq("id", session.id);

  return `Incident flagged: "${args.description}". It will be formally documented when the call ends.`;
}

interface LogSymptomArgs {
  description: string;
  resident_name?: string;
  body_area?: string;
}

async function handleLogSymptom(
  supabase: ReturnType<typeof createAdminClient>,
  session: { id: string; organization_id: string; resident_id: string | null },
  args: LogSymptomArgs
): Promise<string> {
  let residentId = session.resident_id ?? null;

  if (!residentId && args.resident_name) {
    const resident = await findResident(
      supabase,
      session.organization_id,
      args.resident_name
    );
    residentId = resident?.id ?? null;
  }

  if (!residentId) {
    return "Symptom noted, but I couldn't identify the resident. Please clarify who this is for.";
  }

  const { data: sessionRow } = await supabase
    .from("voice_sessions")
    .select("metadata")
    .eq("id", session.id)
    .single();

  const existing = (sessionRow as { metadata: Record<string, unknown> | null } | null)
    ?.metadata ?? {};

  const pendingSymptoms: unknown[] = Array.isArray(existing.pending_symptoms)
    ? (existing.pending_symptoms as unknown[])
    : [];

  pendingSymptoms.push({
    resident_id: residentId,
    description: args.description,
    body_area: args.body_area ?? null,
    logged_at: new Date().toISOString(),
  });

  await supabase
    .from("voice_sessions")
    .update({ metadata: { ...existing, pending_symptoms: pendingSymptoms } as Json })
    .eq("id", session.id);

  return `Symptom logged: "${args.description}"${args.body_area ? ` (${args.body_area})` : ""}. I'll include this in the care note.`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!verifyVapiWebhook(request)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = (await request.json()) as { message: VapiToolCallMessage };
  const message = body.message;

  if (message.type !== "tool-calls") {
    return NextResponse.json({ received: true });
  }

  const sessionId = getSessionId(message.call);
  if (!sessionId) {
    return NextResponse.json({ error: "No sessionId in call metadata" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: sessionRow } = await supabase
    .from("voice_sessions")
    .select("id, organization_id, caregiver_id, resident_id, metadata")
    .eq("id", sessionId)
    .single();

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const session = sessionRow as {
    id: string;
    organization_id: string;
    caregiver_id: string;
    resident_id: string | null;
    metadata: Record<string, unknown> | null;
  };

  const results: Array<{ toolCallId: string; result: string }> = [];

  for (const toolCall of message.toolCallList) {
    let result: string;

    try {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

      switch (toolCall.function.name) {
        case "create_task":
          result = await handleCreateTask(supabase, session, args as unknown as CreateTaskArgs);
          break;

        case "flag_incident":
          result = await handleFlagIncident(supabase, session, args as unknown as FlagIncidentArgs);
          break;

        case "log_symptom":
          result = await handleLogSymptom(supabase, session, args as unknown as LogSymptomArgs);
          break;

        default:
          result = `Unknown tool: ${toolCall.function.name}`;
      }
    } catch (err) {
      result = `Tool error: ${err instanceof Error ? err.message : "Unknown error"}`;
    }

    results.push({ toolCallId: toolCall.id, result });
  }

  return NextResponse.json({ results });
}
