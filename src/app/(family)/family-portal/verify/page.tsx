import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken } from "@/lib/family/invite-token";
import { AcceptInviteButton } from "@/components/family/accept-invite-button";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

type State =
  | { kind: "valid"; token: string; residentFirstName: string; facilityName: string }
  | { kind: "consumed" }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "not_found" };

async function inspectToken(unsigned: string): Promise<State> {
  if (!unsigned || unsigned.length < 16) return { kind: "not_found" };

  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("family_invite_tokens")
    .select(
      "id, family_user_link_id, expires_at, consumed_at, revoked_at"
    )
    .eq("token_hash", hashInviteToken(unsigned))
    .maybeSingle();
  const token = tokenRow as
    | {
        id: string;
        family_user_link_id: string;
        expires_at: string;
        consumed_at: string | null;
        revoked_at: string | null;
      }
    | null;

  if (!token) return { kind: "not_found" };
  if (token.revoked_at) return { kind: "revoked" };
  if (token.consumed_at) return { kind: "consumed" };
  if (new Date(token.expires_at).getTime() < Date.now()) {
    return { kind: "expired" };
  }

  // Welcome copy: resident first name + facility name via the link.
  const { data: linkRow } = await admin
    .from("family_user_links")
    .select(
      "id, link_status, family_contacts(residents(first_name, organizations(name)))"
    )
    .eq("id", token.family_user_link_id)
    .single();
  const link = linkRow as
    | {
        id: string;
        link_status: string;
        family_contacts: {
          residents: {
            first_name: string;
            organizations: { name: string } | null;
          } | null;
        } | null;
      }
    | null;
  if (!link || link.link_status === "revoked") return { kind: "revoked" };

  return {
    kind: "valid",
    token: unsigned,
    residentFirstName:
      link.family_contacts?.residents?.first_name ?? "your loved one",
    facilityName:
      link.family_contacts?.residents?.organizations?.name ?? "the facility",
  };
}

export default async function FamilyVerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenParam = typeof params.token === "string" ? params.token : "";
  const state = await inspectToken(tokenParam);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-4 py-8">
        {state.kind === "valid" ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h1 className="text-xl font-semibold">
              Welcome to {state.facilityName}&apos;s family portal
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been invited to follow care updates for{" "}
              <strong>{state.residentFirstName}</strong>. Tap below to open
              the portal.
            </p>
            <AcceptInviteButton token={state.token} />
          </>
        ) : state.kind === "expired" ? (
          <>
            <Clock className="h-12 w-12 text-amber-600 mx-auto" />
            <h1 className="text-xl font-semibold">This link has expired.</h1>
            <p className="text-sm text-muted-foreground">
              Invite links are valid for 7 days. Ask the facility to send a
              fresh invitation.
            </p>
          </>
        ) : state.kind === "consumed" ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">This link was already used.</h1>
            <p className="text-sm text-muted-foreground">
              If you&apos;re already signed in, head to the portal. Otherwise,
              ask the facility for a new invitation.
            </p>
          </>
        ) : state.kind === "revoked" ? (
          <>
            <XCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-semibold">
              This invitation is no longer active.
            </h1>
            <p className="text-sm text-muted-foreground">
              The facility may have sent a newer invite or revoked access.
              Check your inbox for a more recent email.
            </p>
          </>
        ) : (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Link not recognised.</h1>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find this invite. If you copied the URL from an
              email, double-check nothing was cut off, or ask the facility for
              a fresh invitation.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
