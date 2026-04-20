"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Mail, Phone, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { ClinicianForm, type ClinicianFormValues } from "./clinician-form";

type Clinician = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  specialty: string | null;
  npi: string | null;
  notes: string | null;
  is_active: boolean;
};

export function ClinicianList({
  clinicians,
  organizationId,
}: {
  clinicians: Clinician[];
  organizationId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Clinician | null>(null);

  async function handleCreate(values: ClinicianFormValues) {
    const { error } = await supabase.from("clinicians").insert({
      organization_id: organizationId,
      full_name: values.fullName,
      email: values.email,
      phone: values.phone || null,
      specialty: values.specialty || null,
      npi: values.npi || null,
      notes: values.notes || null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Clinician added");
    setAddOpen(false);
    router.refresh();
  }

  async function handleUpdate(id: string, values: ClinicianFormValues) {
    const { error } = await supabase
      .from("clinicians")
      .update({
        full_name: values.fullName,
        email: values.email,
        phone: values.phone || null,
        specialty: values.specialty || null,
        npi: values.npi || null,
        notes: values.notes || null,
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Clinician updated");
    setEditing(null);
    router.refresh();
  }

  async function handleDeactivate(id: string, currentlyActive: boolean) {
    const { error } = await supabase
      .from("clinicians")
      .update({ is_active: !currentlyActive })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(currentlyActive ? "Clinician deactivated" : "Clinician reactivated");
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-4 w-4" />
            Add Clinician
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Clinician</DialogTitle>
            </DialogHeader>
            <ClinicianForm onSubmit={handleCreate} />
          </DialogContent>
        </Dialog>
      </div>

      {clinicians.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No clinicians yet. Add a treating physician or specialist above.
        </p>
      )}

      <div className="space-y-3">
        {clinicians.map((c) => (
          <Card key={c.id} className={!c.is_active ? "opacity-60" : ""}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{c.full_name}</p>
                    {c.specialty && (
                      <Badge variant="secondary" className="text-xs">
                        <Stethoscope className="mr-1 h-3 w-3" />
                        {c.specialty}
                      </Badge>
                    )}
                    {!c.is_active && (
                      <Badge variant="outline" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {c.email}
                    </span>
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.npi && (
                      <span>NPI {c.npi}</span>
                    )}
                  </div>
                  {c.notes && (
                    <p className="mt-2 text-xs text-muted-foreground">{c.notes}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(c)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivate(c.id, c.is_active)}
                  >
                    {c.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Clinician</DialogTitle>
          </DialogHeader>
          {editing && (
            <ClinicianForm
              initialValues={{
                fullName: editing.full_name,
                email: editing.email,
                phone: editing.phone ?? "",
                specialty: editing.specialty ?? "",
                npi: editing.npi ?? "",
                notes: editing.notes ?? "",
              }}
              submitLabel="Save"
              onSubmit={(values) => handleUpdate(editing.id, values)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
