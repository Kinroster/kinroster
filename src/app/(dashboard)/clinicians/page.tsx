import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ClinicianList } from "@/components/clinicians/clinician-list";

export default async function CliniciansPage() {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("clinicians")
    .select("*")
    .eq("organization_id", user.organization_id)
    .order("full_name");

  const clinicians = (data ?? []) as Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    specialty: string | null;
    npi: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
  }>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Treating Clinicians</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Directory of physicians and other providers. Assign clinicians to
          residents from the resident page, then share notes with them via a
          secure portal link.
        </p>
      </div>
      <ClinicianList
        clinicians={clinicians}
        organizationId={user.organization_id}
      />
    </div>
  );
}
