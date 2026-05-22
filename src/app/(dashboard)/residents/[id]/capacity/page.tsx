import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import type {
  Resident,
  ResidentDecisionalCapacity,
  ResidentDecisionalCapacityHistory,
} from "@/types/database";
import { CapacityForm } from "@/components/residents/capacity-form";

export default async function ResidentCapacityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: residentId } = await params;
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data: residentData } = await supabase
    .from("residents")
    .select("*")
    .eq("id", residentId)
    .eq("organization_id", user.organization_id)
    .single();
  const resident = residentData as Resident | null;
  if (!resident) notFound();

  const { data: capacityData } = await supabase
    .from("resident_decisional_capacity")
    .select("*")
    .eq("resident_id", residentId)
    .maybeSingle();
  const current = (capacityData as ResidentDecisionalCapacity | null) ?? null;

  const { data: historyData } = await supabase
    .from("resident_decisional_capacity_history")
    .select("*")
    .eq("resident_id", residentId)
    .order("changed_at", { ascending: false })
    .limit(50);
  const history =
    (historyData as ResidentDecisionalCapacityHistory[] | null) ?? [];

  const residentFullName =
    `${resident.first_name} ${resident.last_name}`.trim();

  return (
    <div className="px-4 py-6 space-y-4 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold">
          Decisional capacity — {residentFullName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Records who has legal authority to consent on behalf of the
          resident. Required before capturing recording consent or any
          AI-assisted surface that processes the resident&apos;s voice or
          health data. Every change is captured in an append-only history.
        </p>
      </div>

      <CapacityForm
        residentId={residentId}
        residentName={residentFullName}
        current={current}
        history={history}
      />
    </div>
  );
}
