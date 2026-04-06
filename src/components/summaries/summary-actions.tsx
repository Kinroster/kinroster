"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check } from "lucide-react";

export function SummaryActions({ summaryId }: { summaryId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleApprove() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("weekly_summaries")
      .update({
        status: "approved",
        reviewed_by: user!.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", summaryId);

    if (error) {
      toast.error("Failed to approve summary");
    } else {
      toast.success("Summary approved");
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <div className="flex gap-2 pt-2">
      <Button onClick={handleApprove} disabled={loading} size="sm">
        <Check className="mr-1 h-3 w-3" />
        {loading ? "Approving..." : "Approve"}
      </Button>
    </div>
  );
}
