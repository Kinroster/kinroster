import { getAuthenticatedUser } from "@/lib/auth";
import { ResidentForm } from "@/components/residents/resident-form";

export default async function NewResidentPage() {
  const user = await getAuthenticatedUser();

  return (
    <div className="px-4 py-6">
      <h2 className="mb-6 text-xl font-semibold">Add Resident</h2>
      <ResidentForm
        regulatoryRegion={user.organizations.regulatory_region}
      />
    </div>
  );
}
