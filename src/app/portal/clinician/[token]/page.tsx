import { headers } from "next/headers";
import { ClinicianPortalView } from "@/components/portal/clinician-portal-view";
import type { ClinicianSummaryOutput } from "@/lib/prompts/clinician-summary";

type PortalData = {
  facility_name: string;
  resident: {
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
  } | null;
  clinician: {
    full_name: string;
    specialty: string | null;
  } | null;
  summary: ClinicianSummaryOutput;
  expires_at: string;
};

async function fetchPortal(token: string): Promise<
  | { kind: "ok"; data: PortalData }
  | { kind: "error"; status: number; message: string }
> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  try {
    const res = await fetch(
      `${origin}/api/portal/clinician/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const body = await res.json();
    if (!res.ok) {
      return {
        kind: "error",
        status: res.status,
        message: body.error || "Unable to load",
      };
    }
    return { kind: "ok", data: body as PortalData };
  } catch {
    return { kind: "error", status: 500, message: "Unable to load" };
  }
}

export default async function ClinicianPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchPortal(token);

  if (result.kind === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Link unavailable</h1>
          <p className="text-sm text-muted-foreground">{result.message}</p>
          <p className="text-xs text-muted-foreground">
            If you believe this is an error, please contact the facility that
            sent you this link.
          </p>
        </div>
      </div>
    );
  }

  return <ClinicianPortalView {...result.data} />;
}
