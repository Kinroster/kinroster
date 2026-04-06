"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Send, Save } from "lucide-react";
import { format, subDays } from "date-fns";
import type { FamilyContact } from "@/types/database";

type Step = "configure" | "generating" | "editing" | "sending";

export function FamilyUpdateEditor({
  residentId,
  organizationId,
  contacts,
}: {
  residentId: string;
  organizationId: string;
  contacts: FamilyContact[];
}) {
  const [step, setStep] = useState<Step>("configure");
  const [contactId, setContactId] = useState(contacts[0]?.id || "");
  const [dateStart, setDateStart] = useState(
    format(subDays(new Date(), 7), "yyyy-MM-dd")
  );
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [commId, setCommId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleGenerate() {
    if (!contactId) {
      toast.error("Select a family contact");
      return;
    }

    setStep("generating");

    try {
      const res = await fetch("/api/claude/family-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId,
          contactId,
          dateRangeStart: dateStart,
          dateRangeEnd: dateEnd,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to generate update");
        setStep("configure");
        return;
      }

      const data = await res.json();
      setSubject(data.subject);
      setBody(data.body);
      setStep("editing");
    } catch {
      toast.error("Failed to generate update");
      setStep("configure");
    }
  }

  async function handleSaveDraft() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("family_communications")
      .insert({
        organization_id: organizationId,
        resident_id: residentId,
        generated_by: user!.id,
        recipient_contact_id: contactId,
        subject,
        body,
        date_range_start: dateStart,
        date_range_end: dateEnd,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to save draft");
      return;
    }

    const savedComm = data as { id: string };
    setCommId(savedComm.id);
    toast.success("Draft saved");
  }

  async function handleSend() {
    setStep("sending");

    // Save first if not already saved
    let id = commId;
    if (!id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("family_communications")
        .insert({
          organization_id: organizationId,
          resident_id: residentId,
          generated_by: user!.id,
          recipient_contact_id: contactId,
          subject,
          body,
          date_range_start: dateStart,
          date_range_end: dateEnd,
          status: "draft",
        })
        .select()
        .single();

      if (error || !data) {
        toast.error("Failed to save before sending");
        setStep("editing");
        return;
      }
      id = (data as { id: string }).id;
      setCommId(id);
    }

    // Send via API
    try {
      const res = await fetch("/api/family/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communicationId: id }),
      });

      if (res.ok) {
        toast.success("Email sent to family");
        router.push("/family");
        router.refresh();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to send email");
        setStep("editing");
      }
    } catch {
      toast.error("Failed to send email");
      setStep("editing");
    }
  }

  const selectedContact = contacts.find((c) => c.id === contactId);

  if (step === "configure" || step === "generating") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Family Contact</Label>
          <Select value={contactId} onValueChange={(v) => v && setContactId(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select contact" />
            </SelectTrigger>
            <SelectContent>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.relationship})
                  {c.email ? ` — ${c.email}` : " — no email"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>From Date</Label>
            <Input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>To Date</Label>
            <Input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={step === "generating" || !contactId}
          className="w-full"
        >
          {step === "generating" ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Generating update...
            </>
          ) : (
            "Generate Family Update"
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        To: {selectedContact?.name} ({selectedContact?.relationship}) —{" "}
        {selectedContact?.email || "no email"}
      </div>

      <div className="space-y-2">
        <Label>Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Email Body</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSend}
          disabled={step === "sending" || !selectedContact?.email}
          className="flex-1"
        >
          {step === "sending" ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="mr-1 h-4 w-4" />
              Send Email
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleSaveDraft}>
          <Save className="mr-1 h-4 w-4" />
          Save Draft
        </Button>
      </div>
    </div>
  );
}
