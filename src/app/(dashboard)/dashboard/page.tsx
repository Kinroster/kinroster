import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  Mic,
  Users,
  AlertTriangle,
  ListTodo,
  ChevronRight,
  Phone,
  FileText,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard" };

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-600 bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
  high: "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
  normal: "text-primary bg-primary/5 border-primary/20",
  low: "text-muted-foreground bg-muted/30 border-border",
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  normal: "bg-primary",
  low: "bg-muted-foreground/50",
};

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();
  const orgId = user.organization_id;
  const isAdmin = user.role === "admin" || user.role === "compliance_admin";
  const isClinical =
    user.role !== "ops_staff" && user.role !== "billing_staff";

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // All queries run in parallel
  const [
    tasksResult,
    overdueTasksResult,
    callsResult,
    notesResult,
    incidentsResult,
    residentsResult,
    summariesResult,
  ] = await Promise.all([
    // My pending tasks due today or earlier (or all tasks for admin)
    supabase
      .from("care_tasks")
      .select(
        "id, title, priority, status, due_date, due_time, source, residents(id, first_name, last_name)"
      )
      .eq("organization_id", orgId)
      .in("status", ["pending", "in_progress"])
      .lte("due_date", todayStr)
      .not("due_date", "is", null)
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true })
      .limit(10),

    // Overdue count (due before today)
    supabase
      .from("care_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .in("status", ["pending", "in_progress"])
      .lt("due_date", todayStr),

    // Recent voice calls (mine or all for admin)
    supabase
      .from("voice_sessions")
      .select(
        "id, created_at, status, call_type, duration_seconds, residents(id, first_name, last_name)"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),

    // Recent notes with structured output (symptoms/observations)
    supabase
      .from("notes")
      .select(
        "id, created_at, note_type, structured_output, flagged_as_incident, residents(id, first_name, last_name)"
      )
      .eq("organization_id", orgId)
      .eq("is_structured", true)
      .not("structured_output", "is", null)
      .order("created_at", { ascending: false })
      .limit(6),

    // Open incidents
    supabase
      .from("incident_reports")
      .select("id, severity, incident_type, created_at, residents(id, first_name, last_name)")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5),

    // Active residents count
    supabase
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active"),

    // Pending weekly summaries awaiting review
    supabase
      .from("weekly_summaries")
      .select("id, week_start, week_end, residents(id, first_name, last_name)")
      .eq("organization_id", orgId)
      .eq("status", "pending_review")
      .order("week_start", { ascending: false })
      .limit(3),
  ]);

  const tasks = (tasksResult.data ?? []) as Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    due_date: string | null;
    due_time: string | null;
    source: string;
    residents: { id: string; first_name: string; last_name: string } | null;
  }>;

  const overdueCount = overdueTasksResult.count ?? 0;

  const calls = (callsResult.data ?? []) as Array<{
    id: string;
    created_at: string;
    status: string;
    call_type: string;
    duration_seconds: number | null;
    residents: { id: string; first_name: string; last_name: string } | null;
  }>;

  const notes = (notesResult.data ?? []) as Array<{
    id: string;
    created_at: string;
    note_type: string;
    structured_output: string | null;
    flagged_as_incident: boolean | null;
    residents: { id: string; first_name: string; last_name: string } | null;
  }>;

  const incidents = (incidentsResult.data ?? []) as Array<{
    id: string;
    severity: string;
    incident_type: string | null;
    created_at: string;
    residents: { id: string; first_name: string; last_name: string } | null;
  }>;

  const activeResidentCount = residentsResult.count ?? 0;

  const pendingSummaries = (summariesResult.data ?? []) as Array<{
    id: string;
    week_start: string;
    week_end: string;
    residents: { id: string; first_name: string; last_name: string } | null;
  }>;

  // Extract a short observation snippet from structured JSON
  function extractSnippet(structuredOutput: string | null): string | null {
    if (!structuredOutput) return null;
    try {
      const parsed = JSON.parse(structuredOutput) as {
        summary?: string;
        observations?: string;
        symptoms?: string;
      };
      return parsed.summary ?? parsed.observations ?? parsed.symptoms ?? null;
    } catch {
      return null;
    }
  }

  const callsThisWeek = calls.filter(
    (c) => new Date(c.created_at) >= new Date(weekAgo)
  ).length;

  const reviewItemCount =
    incidents.length + pendingSummaries.length;

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = (user.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="min-h-full bg-muted/20">
      {/* Page header */}
      <div className="border-b bg-background px-4 py-5 md:px-6">
        <h1 className="text-xl font-semibold">
          {greeting}, {firstName}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {now.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="px-4 py-5 md:px-6 space-y-6">
        {/* ── Stat cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            href="/calendar"
            icon={<ListTodo className="h-4 w-4" />}
            value={tasks.length}
            label="Tasks due"
            alert={overdueCount > 0}
            sub={overdueCount > 0 ? `${overdueCount} overdue` : undefined}
          />
          <StatCard
            href="/voice-sessions"
            icon={<Phone className="h-4 w-4" />}
            value={callsThisWeek}
            label="Calls this week"
          />
          <StatCard
            href="/residents"
            icon={<Users className="h-4 w-4" />}
            value={activeResidentCount}
            label="Active residents"
          />
          <StatCard
            href="/incidents"
            icon={<AlertTriangle className="h-4 w-4" />}
            value={reviewItemCount}
            label="Items to review"
            alert={incidents.some((i) => i.severity === "high")}
          />
        </div>

        {/* ── Main content: 2 columns on desktop ─────────────────────── */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* LEFT: Tasks */}
          <Section
            title="My Tasks"
            icon={<ListTodo className="h-4 w-4" />}
            href="/calendar"
            linkLabel="View calendar"
            empty={tasks.length === 0}
            emptyText="No tasks due today"
          >
            <div className="divide-y">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                  )}
                >
                  <div
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      PRIORITY_DOT[task.priority] ?? "bg-primary"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                      {task.residents && (
                        <span className="text-xs text-muted-foreground">
                          {task.residents.first_name} {task.residents.last_name}
                        </span>
                      )}
                      {task.due_date && task.due_date < todayStr && (
                        <span className="text-[10px] font-medium text-red-600 bg-red-50 rounded px-1 py-0.5 dark:bg-red-950/40">
                          Overdue
                        </span>
                      )}
                      {task.source === "voice_call" && (
                        <span className="flex items-center gap-0.5 text-[10px] text-primary">
                          <Mic className="h-2.5 w-2.5" />
                          From call
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                      PRIORITY_COLOR[task.priority]
                    )}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* RIGHT: Recent calls */}
          <Section
            title="Recent Calls"
            icon={<Mic className="h-4 w-4" />}
            href="/voice-sessions"
            linkLabel="View all calls"
            empty={calls.length === 0}
            emptyText="No calls yet"
          >
            <div className="divide-y">
              {calls.map((call) => {
                const resident = call.residents;
                const isCompleted = call.status === "completed";
                const label =
                  call.call_type === "resident_onboarding"
                    ? "Onboarding"
                    : call.call_type === "global_triage"
                    ? "Quick call"
                    : "Care note";
                return (
                  <div
                    key={call.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        isCompleted
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {resident
                          ? `${resident.first_name} ${resident.last_name}`
                          : label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(call.created_at)}
                        </span>
                        {call.duration_seconds && (
                          <span className="text-xs text-muted-foreground">
                            · {formatDuration(call.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-medium capitalize rounded-full px-2 py-0.5",
                        isCompleted
                          ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {call.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        {/* ── Recent notes / symptoms ─────────────────────────────────── */}
        {isClinical && notes.length > 0 && (
          <Section
            title="Recent Observations"
            icon={<Activity className="h-4 w-4" />}
            href="/today"
            linkLabel="View today's notes"
          >
            <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => {
                const snippet = extractSnippet(note.structured_output);
                const resident = note.residents;
                return (
                  <Link
                    key={note.id}
                    href={
                      resident
                        ? `/residents/${resident.id}`
                        : "/today"
                    }
                    className="group rounded-lg border bg-background p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">
                          {resident
                            ? `${resident.first_name} ${resident.last_name}`
                            : "Unknown resident"}
                        </span>
                      </div>
                      {note.flagged_as_incident && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                    </div>
                    {snippet && (
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {snippet}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {formatRelative(note.created_at)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Items to review ─────────────────────────────────────────── */}
        {(incidents.length > 0 || pendingSummaries.length > 0) && (
          <Section
            title="Items to Review"
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            <div className="divide-y">
              {incidents.map((incident) => (
                <Link
                  key={incident.id}
                  href="/incidents"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {incident.residents
                        ? `${incident.residents.first_name} ${incident.residents.last_name}`
                        : "Incident"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {incident.incident_type ?? "Incident"} ·{" "}
                      {formatRelative(incident.created_at)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      incident.severity === "high" ? "destructive" : "secondary"
                    }
                    className="shrink-0 capitalize text-[10px]"
                  >
                    {incident.severity}
                  </Badge>
                </Link>
              ))}

              {pendingSummaries.map((summary) => (
                <Link
                  key={summary.id}
                  href={
                    summary.residents
                      ? `/residents/${summary.residents.id}`
                      : "/summaries"
                  }
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/30">
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      Weekly summary —{" "}
                      {summary.residents
                        ? `${summary.residents.first_name} ${summary.residents.last_name}`
                        : "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {summary.week_start} to {summary.week_end} · Pending review
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Review
                  </Badge>
                </Link>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function StatCard({
  href,
  icon,
  value,
  label,
  sub,
  alert,
}: {
  href: string;
  icon: React.ReactNode;
  value: number;
  label: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-background p-4 transition-colors hover:bg-muted/40",
        alert && "border-destructive/40"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-muted-foreground group-hover:text-foreground transition-colors",
            alert && "text-destructive"
          )}
        >
          {icon}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </div>
      <div>
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            alert && "text-destructive"
          )}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        {sub && (
          <p className="text-[10px] font-medium text-destructive mt-0.5">{sub}</p>
        )}
      </div>
    </Link>
  );
}

function Section({
  title,
  icon,
  href,
  linkLabel,
  empty,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href?: string;
  linkLabel?: string;
  empty?: boolean;
  emptyText?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {href && linkLabel && (
          <Link
            href={href}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {linkLabel}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {empty ? (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {emptyText ?? "Nothing here"}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
