"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Mic, MicOff, ShieldAlert } from "lucide-react";
import type { ResidentRecordingConsent } from "@/types/database";
import {
  CONSENT_CLASS_LABELS,
  JURISDICTION_LABELS,
  type ConsentClass,
  type RecordingConsentLocale,
  type RecordingJurisdiction,
  localesForJurisdiction,
  renderRecordingConsentText,
} from "@/lib/recording-consent/consent-text";

type ConsentingPartyType = "resident" | "personal_representative";

const CLASSES: ConsentClass[] = [
  "staff_dictation",
  "resident_speaking",
  "family_about_resident",
];

export function RecordingConsentManager({
  residentId,
  residentName,
  orgName,
  dpoEmail,
  expectedJurisdiction,
  consents,
  attorneyReviewed,
  consentTextVersion,
}: {
  residentId: string;
  residentName: string;
  orgName: string;
  dpoEmail: string;
  expectedJurisdiction: RecordingJurisdiction;
  consents: ResidentRecordingConsent[];
  attorneyReviewed: boolean;
  consentTextVersion: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [consentClass, setConsentClass] =
    useState<ConsentClass>("staff_dictation");
  const [jurisdiction, setJurisdiction] = useState<RecordingJurisdiction>(
    expectedJurisdiction
  );
  const [locale, setLocale] = useState<RecordingConsentLocale>(
    localesForJurisdiction(expectedJurisdiction)[0] ?? "en"
  );
  const [partyType, setPartyType] = useState<ConsentingPartyType>(
    "personal_representative"
  );
  const [partyName, setPartyName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [signedTypedName, setSignedTypedName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const availableLocales = useMemo(
    () => localesForJurisdiction(jurisdiction),
    [jurisdiction]
  );

  const preview = useMemo(
    () =>
      renderRecordingConsentText(jurisdiction, consentClass, locale, {
        orgName,
        dpoEmail,
        residentName,
      }),
    [jurisdiction, consentClass, locale, orgName, dpoEmail, residentName]
  );

  // Active consent per class so we can show a status grid.
  const activeByClass = useMemo(() => {
    const map = new Map<ConsentClass, ResidentRecordingConsent>();
    for (const row of consents) {
      if (row.withdrawn_at) continue;
      const cls = row.consent_class as ConsentClass;
      if (!map.has(cls)) map.set(cls, row);
    }
    return map;
  }, [consents]);

  const jurisdictionMismatch = jurisdiction !== expectedJurisdiction;

  async function handleCapture() {
    if (!partyName.trim() || !signedTypedName.trim() || !acknowledged) {
      toast.error("Fill name, signature, and check the acknowledgment box");
      return;
    }
    if (
      partyType === "personal_representative" &&
      !relationship.trim()
    ) {
      toast.error("Personal representative must declare relationship");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/recording-consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId,
          consentClass,
          jurisdiction,
          locale,
          consentingPartyType: partyType,
          consentingPartyName: partyName.trim(),
          consentingPartyRelationship: relationship.trim() || null,
          signedTypedName: signedTypedName.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to record consent");
        return;
      }
      toast.success("Recording consent captured");
      router.refresh();
      setPartyName("");
      setRelationship("");
      setSignedTypedName("");
      setAcknowledged(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw(consentId: string) {
    const reason = window.prompt(
      "Reason for withdrawal (will be recorded in the audit log):"
    );
    if (!reason?.trim()) return;
    const res = await fetch(
      `/api/recording-consents/${consentId}/withdraw`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Failed to withdraw");
      return;
    }
    toast.success("Consent withdrawn");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border p-3 space-y-2">
        <h3 className="font-medium text-sm">Active consents by class</h3>
        <p className="text-xs text-muted-foreground">
          Expected jurisdiction for this organization:{" "}
          <code>{JURISDICTION_LABELS[expectedJurisdiction]}</code>. Active
          consents whose jurisdiction does not match will be REJECTED by
          the voice-start gate.
        </p>
        <ul className="text-xs space-y-1.5">
          {CLASSES.map((cls) => {
            const active = activeByClass.get(cls);
            const mismatch =
              active && active.jurisdiction !== expectedJurisdiction;
            return (
              <li
                key={cls}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-muted-foreground">
                  {CONSENT_CLASS_LABELS[cls]}
                </span>
                {active ? (
                  <Badge
                    variant="outline"
                    className={
                      mismatch
                        ? "text-amber-700 border-amber-500/50"
                        : "text-green-700 border-green-500/50"
                    }
                  >
                    {mismatch ? (
                      <ShieldAlert className="mr-1 h-3 w-3" />
                    ) : (
                      <Mic className="mr-1 h-3 w-3" />
                    )}
                    {mismatch
                      ? `Mismatch (${active.jurisdiction})`
                      : "Active"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    <MicOff className="mr-1 h-3 w-3" />
                    None
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-md border p-3">
        <h3 className="font-medium text-sm">Capture new consent</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Consent class</Label>
            <Select
              value={consentClass}
              onValueChange={(v) => v && setConsentClass(v as ConsentClass)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONSENT_CLASS_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Jurisdiction</Label>
            <Select
              value={jurisdiction}
              onValueChange={(v) => {
                if (!v) return;
                const j = v as RecordingJurisdiction;
                setJurisdiction(j);
                const locales = localesForJurisdiction(j);
                if (!locales.includes(locale)) setLocale(locales[0]);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(JURISDICTION_LABELS) as RecordingJurisdiction[]
                ).map((j) => (
                  <SelectItem key={j} value={j}>
                    {JURISDICTION_LABELS[j]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {jurisdictionMismatch && (
          <div className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
            Warning: this jurisdiction does not match the organization&apos;s
            expected jurisdiction (
            <code>{JURISDICTION_LABELS[expectedJurisdiction]}</code>). The
            resulting consent will be REJECTED by the voice-start gate
            until the org setting is updated.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Locale</Label>
            <Select
              value={locale}
              onValueChange={(v) =>
                v && setLocale(v as RecordingConsentLocale)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLocales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l === "en" ? "English" : "繁體中文 (zh-TW)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Consenting party</Label>
            <Select
              value={partyType}
              onValueChange={(v) =>
                v && setPartyType(v as ConsentingPartyType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resident">
                  Resident (signing for themselves)
                </SelectItem>
                <SelectItem value="personal_representative">
                  Personal representative
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder={
                partyType === "resident" ? residentName : "e.g., Jane Smith"
              }
            />
          </div>
          {partyType === "personal_representative" && (
            <div className="space-y-1">
              <Label>Relationship to resident</Label>
              <Input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g., Daughter, Healthcare POA"
              />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label>Consent text the party will read</Label>
          <pre className="rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap font-sans max-h-64 overflow-auto">
            {preview}
          </pre>
          <p className="text-xs text-muted-foreground">
            Version <code>{consentTextVersion}</code>
            {!attorneyReviewed && (
              <span className="text-amber-700"> · provisional</span>
            )}
            . The exact text above is what will be stored on the consent
            record.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Signature (typed full name)</Label>
          <Input
            value={signedTypedName}
            onChange={(e) => setSignedTypedName(e.target.value)}
            placeholder="Type the consenting party's full name"
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="rec-ack"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
          />
          <Label
            htmlFor="rec-ack"
            className="text-xs leading-relaxed font-normal cursor-pointer"
          >
            I confirm the consenting party has read the text above and
            provided informed consent. I am capturing this record on their
            behalf and will be named as the capturing user in the audit
            log.
          </Label>
        </div>

        <Button
          onClick={handleCapture}
          disabled={submitting || !acknowledged}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Recording…
            </>
          ) : (
            "Record consent"
          )}
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium text-sm">All consent records</h3>
        {consents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No records yet.</p>
        ) : (
          <ul className="space-y-2">
            {consents.map((c) => (
              <li
                key={c.id}
                className="rounded-md border p-3 text-xs flex items-start justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {CONSENT_CLASS_LABELS[c.consent_class as ConsentClass] ??
                      c.consent_class}{" "}
                    <Badge variant="outline" className="text-xs">
                      {c.jurisdiction}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground">
                    {c.consenting_party_name}{" "}
                    {c.consenting_party_type === "resident"
                      ? "(resident)"
                      : `(personal rep · ${c.consenting_party_relationship ?? "—"})`}
                  </p>
                  <p className="text-muted-foreground">
                    Captured {new Date(c.consented_at).toLocaleString()} ·
                    version <code>{c.consent_text_version}</code> ·{" "}
                    {c.consent_text_locale}
                    {!c.attorney_reviewed && (
                      <span className="text-amber-700"> · provisional</span>
                    )}
                  </p>
                  {c.withdrawn_at && (
                    <p className="text-destructive">
                      Withdrawn {new Date(c.withdrawn_at).toLocaleString()}{" "}
                      — {c.withdrawal_reason}
                    </p>
                  )}
                </div>
                {!c.withdrawn_at && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleWithdraw(c.id)}
                  >
                    Withdraw
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
