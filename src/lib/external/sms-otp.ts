// Phase 4: SMS OTP wrapper.
//
// Per the plan's cross-cutting risk #9, the OTP layer is abstracted
// behind a provider interface so Supabase Auth's phone provider (which
// uses Twilio Verify under the hood, ~$0.05/verification) can be
// swapped without touching the routes. Today we use Supabase Auth's
// signInWithOtp + verifyOtp — a thin wrapper over Twilio Verify with
// no extra SDK dependency.
//
// SECURITY NOTE: rate limiting (3/day/contact for invites, 6/hour/phone
// for verifications) is enforced at the route layer using the existing
// quota infrastructure — NOT here. Captcha-after-3-failures (also
// route-layer) is a follow-up.

import { createAdminClient } from "@/lib/supabase/admin";

export type OtpSendResult =
  | { ok: true }
  | { ok: false; error: string };

export type OtpVerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Send a 6-digit SMS OTP to `phone`. Phone must be E.164 formatted
 * (e.g., +14155551234). Returns immediately after Supabase Auth has
 * dispatched the SMS via Twilio Verify; failures are surfaced for the
 * route to map to a 4xx / 429 response.
 *
 * `shouldCreateUser=false` keeps the codepath idempotent for existing
 * users — the family invite route calls supabase.auth.admin.createUser
 * first, so this only sends the code.
 */
export async function sendSmsOtp(phone: string): Promise<OtpSendResult> {
  const admin = createAdminClient();
  const { error } = await admin.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Verify a 6-digit OTP for a phone. On success returns the
 * auth.users.id — the route layer is responsible for flipping
 * family_user_links.link_status to 'active' and stamping
 * phone_verified_at.
 */
export async function verifySmsOtp(
  phone: string,
  token: string
): Promise<OtpVerifyResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "OTP verification failed" };
  }
  return { ok: true, userId: data.user.id };
}
