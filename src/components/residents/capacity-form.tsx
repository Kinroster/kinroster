"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { LocalDate } from "@/components/ui/local-date";
import type {
  ResidentDecisionalCapacity,
  ResidentDecisionalCapacityHistory,
} from "@/types/database";

type CapacityStatus =
  | "full"
  | "diminished_with_representative"
  | "lacks_capacity";

type AuthorityBasis =
  | "poa_healthcare"
  | "court_guardian"
  | "next_of_kin"
  | "spouse"
  | "other";

const STATUS_LABELS: Record<CapacityStatus, string> = {
  full: "Full capacity",
  diminished_with_representative: "Diminished — representative present",
  lacks_capacity: "Lacks capacity",
};

const AUTHORITY_LABELS: Record<AuthorityBasis, string> = {
  poa_healthcare: "Healthcare Power of Attorney",
  court_guardian: "Court-appointed guardian",
  next_of_kin: "Next of kin",
  spouse: "Spouse",
  other: "Other (describe in notes)",
};

function statusBadge(status: CapacityStatus | null) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-xs">
        <ShieldAlert className="mr-1 h-3 w-3" />
        Not assessed
      </Badge>
    );
  }
  if (status === "full") {
    return (
      <Badge variant="outline" className="text-xs">
        <ShieldCheck className="mr-1 h-3 w-3 text-green-600" />
        Full capacity
      </Badge>
    );
  }
  if (status === "diminished_with_representative") {
    return (
      <Badge variant="outline" className="text-xs">
        <ShieldAlert className="mr-1 h-3 w-3 text-amber-600" />
        Diminished — representative
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      <ShieldX className="mr-1 h-3 w-3 text-destructive" />
      Lacks capacity
    </Badge>
  );
}

function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function CapacityForm({
  residentId,
  residentName,
  current,
  history,
}: {
  residentId: string;
  residentName: string;
  current: ResidentDecisionalCapacity | null;
  history: ResidentDecisionalCapacityHistory[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<CapacityStatus>(
    (current?.capacity_status as CapacityStatus | undefined) ?? "full"
  );
  const [repName, setRepName] = useState(current?.representative_name ?? "");
  const [repRel, setRepRel] = useState(
    current?.representative_relationship ?? ""
  );
  const [authBasis, setAuthBasis] = useState<AuthorityBasis | "">(
    (current?.authority_basis as AuthorityBasis | undefined) ?? ""
  );
  const [docUri, setDocUri] = useState(current?.documentation_uri ?? "");
  const [notes, setNotes] = useState(current?.notes ?? "");
  const [nextReview, setNextReview] = useState(
    toDateInput(current?.next_review_due_at ?? null)
  );

  const needsRep = status !== "full";

  async function handleSave() {
    if (needsRep) {
      if (!repName.trim()) {
        toast.error("Representative name is required");
        return;
      }
      if (!repRel.trim()) {
        toast.error("Representative relationship is required");
        return;
      }
      if (!authBasis) {
        toast.error("Authority basis is required");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/residents/${residentId}/capacity`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capacityStatus: status,
          representativeName: needsRep ? repName.trim() : null,
          representativeRelationship: needsRep ? repRel.trim() : null,
          authorityBasis: needsRep ? authBasis : null,
          documentationUri: docUri.trim() || null,
          notes: notes.trim() || null,
          nextReviewDueAt: nextReview
            ? new Date(nextReview).toISOString()
            : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save assessment");
        return;
      }
      toast.success("Capacity assessment saved");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear() {
    const confirmed = window.confirm(
      "Clear the current assessment? The change is recorded in history; you'll need to capture a new assessment before any consent surface can use it."
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/residents/${residentId}/capacity`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to clear assessment");
        return;
      }
      toast.success("Assessment cleared");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border p-3 space-y-2">
        <h3 className="font-medium text-sm flex items-center gap-2">
          Current status
          {statusBadge((current?.capacity_status as CapacityStatus) ?? null)}
        </h3>
        {current ? (
          <div className="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Resident</span>
            <span>{residentName}</span>
            <span className="text-muted-foreground">Last assessed</span>
            <span><LocalDate value={current.assessed_at} /></span>
            {current.representative_name && (
              <>
                <span className="text-muted-foreground">Representative</span>
                <span>
                  {current.representative_name}
                  {current.representative_relationship
                    ? ` · ${current.representative_relationship}`
                    : ""}
                </span>
              </>
            )}
            {current.authority_basis && (
              <>
                <span className="text-muted-foreground">Authority</span>
                <span>
                  {AUTHORITY_LABELS[
                    current.authority_basis as AuthorityBasis
                  ] ?? current.authority_basis}
                </span>
              </>
            )}
            {current.next_review_due_at && (
              <>
                <span className="text-muted-foreground">Next review</span>
                <span>
                  <LocalDate
                    value={current.next_review_due_at}
                    variant="date"
                  />
                </span>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No assessment captured yet. Default to <em>Full capacity</em> only
            after confirming with the resident or treating clinician.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-md border p-3">
        <h3 className="font-medium text-sm">
          {current ? "Update assessment" : "Capture assessment"}
        </h3>

        <div className="space-y-1">
          <Label>Capacity status</Label>
          <Select
            value={status}
            onValueChange={(v) => v && setStatus(v as CapacityStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as CapacityStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {needsRep && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Representative name</Label>
                <Input
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  placeholder="e.g., Jane Smith"
                />
              </div>
              <div className="space-y-1">
                <Label>Relationship</Label>
                <Input
                  value={repRel}
                  onChange={(e) => setRepRel(e.target.value)}
                  placeholder="e.g., Daughter, Court-appointed guardian"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Authority basis</Label>
              <Select
                value={authBasis || undefined}
                onValueChange={(v) => v && setAuthBasis(v as AuthorityBasis)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select basis…" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUTHORITY_LABELS) as AuthorityBasis[]).map(
                    (b) => (
                      <SelectItem key={b} value={b}>
                        {AUTHORITY_LABELS[b]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Documentation reference (optional)</Label>
              <Input
                value={docUri}
                onChange={(e) => setDocUri(e.target.value)}
                placeholder="e.g., file path, doc ID, scan reference"
              />
              <p className="text-xs text-muted-foreground">
                A free-text reference for the POA / guardianship paperwork.
                Bucket-backed upload arrives in a follow-up.
              </p>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Next review due (optional)</Label>
            <Input
              type="date"
              value={nextReview}
              onChange={(e) => setNextReview(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Clinical / legal notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Rationale, assessing clinician, cognitive-screen results, etc."
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : current ? (
              "Save changes"
            ) : (
              "Capture assessment"
            )}
          </Button>
          {current && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={submitting}
            >
              Clear assessment
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium text-sm">History</h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No history yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">
                    {h.change_op}
                  </span>
                  <span className="text-muted-foreground">
                    <LocalDate value={h.changed_at} />
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                  {h.prior_capacity_status !== h.new_capacity_status && (
                    <>
                      <span>Status</span>
                      <span>
                        {h.prior_capacity_status ?? "—"} →{" "}
                        {h.new_capacity_status}
                      </span>
                    </>
                  )}
                  {h.prior_representative_name !==
                    h.new_representative_name && (
                    <>
                      <span>Representative</span>
                      <span>
                        {h.prior_representative_name ?? "—"} →{" "}
                        {h.new_representative_name ?? "—"}
                      </span>
                    </>
                  )}
                  {h.prior_authority_basis !== h.new_authority_basis && (
                    <>
                      <span>Authority</span>
                      <span>
                        {h.prior_authority_basis ?? "—"} →{" "}
                        {h.new_authority_basis ?? "—"}
                      </span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
