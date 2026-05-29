import { describe, it, expect } from "vitest";
import {
  generateInviteToken,
  hashInviteToken,
  defaultInviteExpiresAt,
  INVITE_EXPIRY_DAYS,
} from "@/lib/family/invite-token";

describe("invite-token", () => {
  it("generates a URL-safe unsigned token and its SHA-256 hash", () => {
    const { unsigned, hash } = generateInviteToken();
    // base64url: no +, /, or = padding.
    expect(unsigned).toMatch(/^[A-Za-z0-9_-]+$/);
    // SHA-256 hex is 64 chars.
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashInviteToken is deterministic and matches generation", () => {
    const { unsigned, hash } = generateInviteToken();
    expect(hashInviteToken(unsigned)).toBe(hash);
    // Same input → same hash on a second call.
    expect(hashInviteToken(unsigned)).toBe(hashInviteToken(unsigned));
  });

  it("different tokens produce different hashes", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.unsigned).not.toBe(b.unsigned);
    expect(a.hash).not.toBe(b.hash);
  });

  it("never stores the unsigned token's plaintext as its own hash", () => {
    const { unsigned, hash } = generateInviteToken();
    expect(hash).not.toBe(unsigned);
  });

  it("default expiry is INVITE_EXPIRY_DAYS in the future", () => {
    const before = Date.now();
    const expires = defaultInviteExpiresAt().getTime();
    const expectedMin = before + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000 - 1000;
    const expectedMax =
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000 + 1000;
    expect(expires).toBeGreaterThanOrEqual(expectedMin);
    expect(expires).toBeLessThanOrEqual(expectedMax);
  });
});
