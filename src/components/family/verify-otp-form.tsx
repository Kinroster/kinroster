"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function VerifyOtpForm({
  initialLinkId,
}: {
  initialLinkId: string;
}) {
  const router = useRouter();
  const [linkId, setLinkId] = useState(initialLinkId);
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!linkId.trim()) {
      toast.error("Invite link missing — open the link from your SMS.");
      return;
    }
    if (!/^\d{6}$/.test(token)) {
      toast.error("Code must be exactly 6 digits");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/family/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: linkId.trim(), token }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Verification failed");
        return;
      }
      const { redirectTo } = (await res.json()) as { redirectTo?: string };
      toast.success("Verified.");
      router.push(redirectTo || "/family-portal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!initialLinkId && (
        <div className="space-y-1">
          <Label htmlFor="linkId">Invite link ID</Label>
          <Input
            id="linkId"
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
            placeholder="Paste the link ID from your SMS"
            autoComplete="off"
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="token">6-digit code</Label>
        <Input
          id="token"
          value={token}
          onChange={(e) =>
            setToken(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="123456"
          inputMode="numeric"
          maxLength={6}
          autoComplete="one-time-code"
        />
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying…
          </>
        ) : (
          "Verify"
        )}
      </Button>
    </form>
  );
}
