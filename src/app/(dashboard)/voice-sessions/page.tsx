import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Mic, Clock, Phone } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function statusVariant(status: string) {
  switch (status) {
    case "completed":
      return "secondary" as const;
    case "in_progress":
      return "default" as const;
    case "failed":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default async function VoiceSessionsPage() {
  const user = await getAuthenticatedUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("voice_sessions")
    .select(
      `
      id,
      status,
      call_type,
      duration_seconds,
      created_at,
      started_at,
      note_id,
      residents (first_name, last_name),
      users:caregiver_id (full_name)
    `
    )
    .eq("organization_id", user.organization_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const sessions = (data ?? []) as Array<{
    id: string;
    status: string;
    call_type: string;
    duration_seconds: number | null;
    created_at: string;
    started_at: string | null;
    note_id: string | null;
    residents: { first_name: string; last_name: string } | null;
    users: { full_name: string } | null;
  }>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Voice Sessions</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No voice sessions yet. Use the Voice Call button on a resident page
            to start your first session.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <Link key={session.id} href={`/voice-sessions/${session.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {session.residents
                        ? `${session.residents.first_name} ${session.residents.last_name}`
                        : "Unknown Resident"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{session.users?.full_name ?? "Unknown"}</span>
                      <span>&middot;</span>
                      <span suppressHydrationWarning>
                        {formatDistanceToNow(new Date(session.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                      {session.duration_seconds && (
                        <>
                          <span>&middot;</span>
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(session.duration_seconds)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge
                      variant={statusVariant(session.status)}
                      className="capitalize text-xs"
                    >
                      {session.status.replace("_", " ")}
                    </Badge>
                    {session.note_id && (
                      <Badge variant="outline" className="text-xs">
                        Note
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
