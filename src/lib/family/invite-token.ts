import crypto from "node:crypto";

// 256-bit random token for the family-portal magic-link invite. The
// unsigned value is returned once (embedded in the emailed link); only
// the SHA-256 hash is persisted in family_invite_tokens. Mirrors the
// family-contact-confirmation + clinician magic-link pattern.
export function generateInviteToken(): { unsigned: string; hash: string } {
  const unsigned = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(unsigned).digest("hex");
  return { unsigned, hash };
}

export function hashInviteToken(unsigned: string): string {
  return crypto.createHash("sha256").update(unsigned).digest("hex");
}

// 7 days: long enough for a family member to spot the email in a
// secondary inbox, short enough that a stale link from a typo can't be
// redeemed indefinitely. Shorter than the 30-day family-contact
// confirmation because this link grants a LOGIN session.
export const INVITE_EXPIRY_DAYS = 7;

export function defaultInviteExpiresAt(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
