"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ClinicianFormValues = {
  fullName: string;
  email: string;
  phone: string;
  specialty: string;
  npi: string;
  notes: string;
};

const EMPTY_VALUES: ClinicianFormValues = {
  fullName: "",
  email: "",
  phone: "",
  specialty: "",
  npi: "",
  notes: "",
};

export function ClinicianForm({
  initialValues,
  submitLabel = "Add Clinician",
  onSubmit,
}: {
  initialValues?: ClinicianFormValues;
  submitLabel?: string;
  onSubmit: (values: ClinicianFormValues) => Promise<void> | void;
}) {
  const [values, setValues] = useState<ClinicianFormValues>(
    initialValues ?? EMPTY_VALUES
  );
  const [loading, setLoading] = useState(false);

  function update<K extends keyof ClinicianFormValues>(
    key: K,
    value: ClinicianFormValues[K]
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(values);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="clinician-name">Full name</Label>
        <Input
          id="clinician-name"
          required
          placeholder="Dr. Rachel Kim"
          value={values.fullName}
          onChange={(e) => update("fullName", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clinician-email">Email</Label>
        <Input
          id="clinician-email"
          type="email"
          required
          placeholder="rkim@clinic.example"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="clinician-phone">Phone</Label>
          <Input
            id="clinician-phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clinician-specialty">Specialty</Label>
          <Input
            id="clinician-specialty"
            placeholder="Primary care"
            value={values.specialty}
            onChange={(e) => update("specialty", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="clinician-npi">NPI (optional)</Label>
        <Input
          id="clinician-npi"
          placeholder="1234567890"
          value={values.npi}
          onChange={(e) => update("npi", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="clinician-notes">Notes (internal)</Label>
        <Textarea
          id="clinician-notes"
          placeholder="How this clinician prefers to be contacted, etc."
          rows={3}
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
