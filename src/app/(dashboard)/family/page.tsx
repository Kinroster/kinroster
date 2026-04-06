import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export default async function FamilyCommsPage() {
  const user = await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("family_communications")
    .select("*, residents(first_name, last_name), family_contacts(name, relationship)")
    .eq("organization_id", user.organization_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const comms = (data ?? []) as Array<{
    id: string;
    subject: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    date_range_start: string;
    date_range_end: string;
    residents: { first_name: string; last_name: string } | null;
    family_contacts: { name: string; relationship: string } | null;
  }>;

  return (
    <div className="px-4 py-6">
      <h2 className="mb-6 text-xl font-semibold">Family Updates</h2>

      {comms.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            No family updates yet. Go to a resident&apos;s profile to generate one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comms.map((comm) => (
            <Card key={comm.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">{comm.subject}</p>
                  <Badge
                    variant={
                      comm.status === "sent"
                        ? "default"
                        : comm.status === "failed"
                        ? "destructive"
                        : "secondary"
                    }
                    className="capitalize"
                  >
                    {comm.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  To: {comm.family_contacts?.name} ({comm.family_contacts?.relationship})
                  {" "}&middot;{" "}
                  {comm.residents?.first_name} {comm.residents?.last_name}
                  {" "}&middot;{" "}
                  {comm.sent_at
                    ? format(new Date(comm.sent_at), "MMM d, h:mm a")
                    : format(new Date(comm.created_at), "MMM d, h:mm a")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
