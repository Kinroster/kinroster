import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CalendarView } from "@/components/calendar/calendar-view";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calendar" };

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>;
}

export default async function CalendarPage({ searchParams }: Props) {
  const { month, year } = await searchParams;
  const supabase = await createClient();

  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const now = new Date();
  const viewYear = year ? parseInt(year) : now.getFullYear();
  const viewMonth = month ? parseInt(month) : now.getMonth(); // 0-indexed

  // Fetch the full 6-week grid window (day 1 of first visible week to last day of last visible week)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const gridStart = new Date(firstDayOfMonth);
  gridStart.setDate(gridStart.getDate() - firstDayOfMonth.getDay()); // back to Sunday

  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
  const gridEnd = new Date(lastDayOfMonth);
  gridEnd.setDate(gridEnd.getDate() + (6 - lastDayOfMonth.getDay())); // forward to Saturday

  const { data: tasks } = await supabase
    .from("care_tasks")
    .select(`
      *,
      residents ( first_name, last_name ),
      users!care_tasks_assigned_to_fkey ( full_name )
    `)
    .gte("due_date", gridStart.toISOString().slice(0, 10))
    .lte("due_date", gridEnd.toISOString().slice(0, 10))
    .neq("status", "cancelled")
    .order("due_date", { ascending: true })
    .order("priority", { ascending: false });

  // Also fetch overdue tasks (pending/in_progress with past due dates) to flag them
  const { data: overdueTasks } = await supabase
    .from("care_tasks")
    .select(`
      *,
      residents ( first_name, last_name ),
      users!care_tasks_assigned_to_fkey ( full_name )
    `)
    .lt("due_date", now.toISOString().slice(0, 10))
    .in("status", ["pending", "in_progress"])
    .order("due_date", { ascending: true });

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-4 md:px-6">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <p className="text-sm text-muted-foreground">Tasks and care schedule</p>
      </div>
      <CalendarView
        tasks={tasks ?? []}
        overdueTasks={overdueTasks ?? []}
        viewYear={viewYear}
        viewMonth={viewMonth}
        today={now.toISOString().slice(0, 10)}
        userId={authUser.id}
      />
    </div>
  );
}
