"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  AlertCircle,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
} from "lucide-react";
import { LocalDate } from "@/components/ui/local-date";

type Trend = "improving" | "stable" | "worsening" | "resolved";

interface ActiveConcern {
  concern: string;
  since: string;
  trend: Trend;
}

interface OpenQuestion {
  question: string;
  asked_by_author_type: "caregiver" | "admin" | "clinician" | "family";
  asked_at: string;
  status: "pending" | "addressed";
}

export interface AIConversationThreadBody {
  schema_version?: string;
  narrative?: string;
  active_concerns?: ActiveConcern[];
  baselines?: Record<string, string>;
  recent_incidents?: Array<{ date: string; summary: string }>;
  follow_ups_open?: Array<{ item: string; since: string }>;
  open_questions?: OpenQuestion[];
  family_safe_summary?: string;
  clinician_clinical_summary?: string;
  notes_consumed_count?: number;
}

interface AIConversationThreadProps {
  body: AIConversationThreadBody | null;
  version: number | null;
  lastUpdatedAt: string | null;
  updateGivingUp: boolean;
  isAdmin: boolean;
}

function trendIcon(t: Trend) {
  switch (t) {
    case "improving":
      return <TrendingUp className="h-3 w-3 text-green-600" />;
    case "worsening":
      return <TrendingDown className="h-3 w-3 text-amber-600" />;
    case "resolved":
      return <CheckCircle2 className="h-3 w-3 text-muted-foreground" />;
    case "stable":
    default:
      return <Minus className="h-3 w-3 text-muted-foreground" />;
  }
}

export function AIConversationThread({
  body,
  version,
  lastUpdatedAt,
  updateGivingUp,
  isAdmin,
}: AIConversationThreadProps) {
  const [expanded, setExpanded] = useState(false);

  if (!body || (!body.narrative && (!body.active_concerns || body.active_concerns.length === 0))) {
    return (
      <div className="mb-4 rounded-xl border bg-card p-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span className="text-xs">
            AI conversation thread will appear after the first voice note or
            structured text note about this resident.
          </span>
        </div>
      </div>
    );
  }

  const activeConcerns = body.active_concerns ?? [];
  const baselines = body.baselines ?? {};
  const recentIncidents = body.recent_incidents ?? [];
  const followUps = body.follow_ups_open ?? [];
  const openQuestions = body.open_questions ?? [];

  return (
    <div className="mb-4 rounded-xl border bg-card p-3 text-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="font-medium">AI conversation thread</h3>
          {version !== null && (
            <Badge variant="outline" className="text-xs">
              v{version}
            </Badge>
          )}
          {updateGivingUp && (
            <Badge
              variant="outline"
              className="text-xs text-amber-700 border-amber-500/50"
            >
              <AlertCircle className="mr-1 h-3 w-3" />
              Stale
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setExpanded((e) => !e)}
          aria-label={expanded ? "Collapse thread" : "Expand thread"}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {body.narrative && (
        <p className="text-sm leading-relaxed">{body.narrative}</p>
      )}

      {activeConcerns.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Active concerns
          </p>
          <ul className="space-y-1">
            {activeConcerns.map((c, i) => (
              <li
                key={`${c.concern}-${i}`}
                className="text-xs flex items-center gap-2"
              >
                {trendIcon(c.trend)}
                <span>{c.concern}</span>
                <span className="text-muted-foreground">
                  · {c.trend} · since {c.since}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && (
        <>
          {Object.keys(baselines).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Baselines
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                {Object.entries(baselines).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground capitalize">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {recentIncidents.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Recent incidents (last 30 days)
              </p>
              <ul className="space-y-0.5 text-xs">
                {recentIncidents.map((i, idx) => (
                  <li key={`${i.date}-${idx}`}>
                    <span className="text-muted-foreground">{i.date}:</span>{" "}
                    {i.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {followUps.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Open follow-ups
              </p>
              <ul className="space-y-0.5 text-xs">
                {followUps.map((f, idx) => (
                  <li key={`${f.item}-${idx}`}>
                    {f.item}{" "}
                    <span className="text-muted-foreground">
                      · since {f.since}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {openQuestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Open questions
              </p>
              <ul className="space-y-1 text-xs">
                {openQuestions.map((q, idx) => (
                  <li
                    key={`${q.asked_at}-${idx}`}
                    className="flex items-start gap-2"
                  >
                    <Badge
                      variant="outline"
                      className={
                        q.status === "addressed"
                          ? "text-green-700 border-green-500/50"
                          : "text-amber-700 border-amber-500/50"
                      }
                    >
                      {q.status}
                    </Badge>
                    <span>
                      {q.question}{" "}
                      <span className="text-muted-foreground">
                        · {q.asked_by_author_type} · {q.asked_at}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isAdmin && body.clinician_clinical_summary && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground font-medium">
                Clinician summary
              </summary>
              <p className="mt-1 leading-relaxed">
                {body.clinician_clinical_summary}
              </p>
            </details>
          )}

          {isAdmin && body.family_safe_summary && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground font-medium">
                Family-safe summary
              </summary>
              <p className="mt-1 leading-relaxed">
                {body.family_safe_summary}
              </p>
            </details>
          )}

          <p className="text-[10px] text-muted-foreground">
            {body.notes_consumed_count != null && (
              <>Built from {body.notes_consumed_count} notes · </>
            )}
            {lastUpdatedAt && (
              <>Last updated <LocalDate value={lastUpdatedAt} /></>
            )}
          </p>
        </>
      )}
    </div>
  );
}
