"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";

// Posts the invite token to /api/family/accept-invite (POST, not a
// GET link, so email scanners can't pre-consume the single-use token).
// On success the server has set the session cookies; we navigate into
// the portal.
export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/family/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Could not open the portal");
        return;
      }
      const { redirectTo } = (await res.json()) as { redirectTo?: string };
      router.push(redirectTo || "/family-portal");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button onClick={handleAccept} disabled={submitting} className="w-full">
      {submitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Opening…
        </>
      ) : (
        <>
          Open the family portal
          <ArrowRight className="ml-2 h-4 w-4" />
        </>
      )}
    </Button>
  );
}
