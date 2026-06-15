"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Mic,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CareTask } from "@/types/database";

type TaskWithJoins = CareTask & {
  residents?: { first_name: string; last_name: string } | null;
  users?: { full_name: string } | null;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  normal: "bg-primary",
  low: "bg-muted-foreground/50",
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-red-500/50 bg-red-50 dark:bg-red-950/30",
  high: "border-orange-400/50 bg-orange-50 dark:bg-orange-950/30",
  normal: "border-primary/30 bg-primary/5",
  low: "border-border",
};

export function CalendarView({
  tasks,
  overdueTasks,
  viewYear,
  viewMonth,
  today,
  userId,
}: {
  tasks: TaskWithJoins[];
  overdueTasks: TaskWithJoins[];
  viewYear: number;
  viewMonth: number;
  today: string;
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  // Build the 6-week grid
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const gridStart = new Date(firstDayOfMonth);
  gridStart.setDate(gridStart.getDate() - firstDayOfMonth.getDay());

  const days: string[] = [];
  const cursor = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  // Group tasks by date
  const tasksByDate: Record<string, TaskWithJoins[]> = {};
  for (const task of tasks) {
    if (!task.due_date) continue;
    if (!tasksByDate[task.due_date]) tasksByDate[task.due_date] = [];
    tasksByDate[task.due_date].push(task);
  }

  function navigate(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    router.push(`/calendar?month=${m}&year=${y}`);
  }

  async function completeTask(taskId: string) {
    setCompleting(taskId);
    await supabase
      .from("care_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: userId,
      })
      .eq("id", taskId);
    setCompleting(null);
    router.refresh();
  }

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];

  return (
    <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/calendar")}
            >
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Overdue banner */}
        {overdueTasks.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900 dark:bg-red-950/40">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
            <span className="font-medium text-red-700 dark:text-red-400">
              {overdueTasks.length} overdue task{overdueTasks.length > 1 ? "s" : ""}
            </span>
            <button
              className="ml-auto text-xs text-red-500 underline underline-offset-2"
              onClick={() => setSelectedDate("overdue")}
            >
              View all
            </button>
          </div>
        )}

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {DAYS.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border">
          {days.map((dateStr) => {
            const isCurrentMonth = dateStr.slice(0, 7) === `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const dayTasks = tasksByDate[dateStr] ?? [];
            const pendingCount = dayTasks.filter((t) => t.status !== "completed").length;
            const hasVoice = dayTasks.some((t) => t.source === "voice_call");
            const dayNum = parseInt(dateStr.slice(8));

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={cn(
                  "relative flex flex-col bg-background p-1.5 text-left transition-colors min-h-[70px] md:min-h-[90px]",
                  !isCurrentMonth && "bg-muted/30",
                  isSelected && "bg-primary/5 ring-1 ring-inset ring-primary",
                  "hover:bg-accent/50"
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : isCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {dayNum}
                </span>

                {/* Voice indicator */}
                {hasVoice && (
                  <Mic className="absolute right-1.5 top-1.5 h-3 w-3 text-primary opacity-70" />
                )}

                {/* Task chips — show up to 2 on desktop, dots on mobile */}
                <div className="hidden md:flex flex-col gap-0.5 w-full">
                  {dayTasks.slice(0, 2).map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[10px] leading-tight",
                        task.status === "completed"
                          ? "bg-muted text-muted-foreground line-through"
                          : task.priority === "urgent"
                          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                          : task.priority === "high"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {task.title}
                    </div>
                  ))}
                  {dayTasks.length > 2 && (
                    <span className="text-[10px] text-muted-foreground px-1">
                      +{dayTasks.length - 2} more
                    </span>
                  )}
                </div>

                {/* Mobile: dots only */}
                <div className="flex flex-wrap gap-0.5 md:hidden">
                  {dayTasks.slice(0, 4).map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        task.status === "completed"
                          ? "bg-muted-foreground/30"
                          : PRIORITY_COLORS[task.priority] ?? "bg-primary"
                      )}
                    />
                  ))}
                  {pendingCount > 4 && (
                    <span className="text-[9px] text-muted-foreground">+{pendingCount - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            Urgent
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-orange-400" />
            High priority
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            Normal
          </div>
          <div className="flex items-center gap-1.5">
            <Mic className="h-3 w-3 text-primary" />
            From voice call
          </div>
        </div>
      </div>

      {/* Day detail panel */}
      {(selectedDate || selectedDate === "overdue") && (
        <div className="border-t md:border-t-0 md:border-l w-full md:w-80 overflow-y-auto bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="font-medium text-sm">
                {selectedDate === "overdue"
                  ? "Overdue tasks"
                  : formatDayHeading(selectedDate!)}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedDate === "overdue"
                  ? `${overdueTasks.length} tasks past due`
                  : `${selectedTasks.length} task${selectedTasks.length !== 1 ? "s" : ""}`}
              </p>
            </div>
            <button
              onClick={() => setSelectedDate(null)}
              className="rounded-md p-1 hover:bg-accent text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3 space-y-2">
            {(selectedDate === "overdue" ? overdueTasks : selectedTasks).length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No tasks for this day
              </div>
            ) : (
              (selectedDate === "overdue" ? overdueTasks : selectedTasks).map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  completing={completing === task.id}
                  onComplete={() => completeTask(task.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  completing,
  onComplete,
}: {
  task: TaskWithJoins;
  completing: boolean;
  onComplete: () => void;
}) {
  const isDone = task.status === "completed";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm transition-opacity",
        PRIORITY_BORDER[task.priority] ?? "border-border",
        isDone && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onComplete}
          disabled={isDone || completing}
          className={cn(
            "mt-0.5 shrink-0 rounded-full transition-colors",
            isDone ? "text-primary" : "text-muted-foreground hover:text-primary"
          )}
        >
          {completing ? (
            <Clock className="h-4 w-4 animate-pulse" />
          ) : (
            <CheckCircle2 className={cn("h-4 w-4", isDone && "fill-primary")} />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className={cn("font-medium leading-snug", isDone && "line-through")}>
            {task.title}
          </p>

          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {task.residents && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {task.residents.first_name} {task.residents.last_name}
              </span>
            )}
            {task.users && (
              <span className="text-[10px] text-muted-foreground">
                → {task.users.full_name}
              </span>
            )}
            {task.source === "voice_call" && (
              <span className="flex items-center gap-0.5 text-[10px] text-primary">
                <Mic className="h-2.5 w-2.5" />
                From call
              </span>
            )}
            {task.due_time && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {task.due_time.slice(0, 5)}
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "h-2 w-2 shrink-0 rounded-full mt-1",
            PRIORITY_COLORS[task.priority] ?? "bg-primary"
          )}
        />
      </div>
    </div>
  );
}

function formatDayHeading(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
