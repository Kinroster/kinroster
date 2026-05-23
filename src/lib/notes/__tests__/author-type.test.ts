import { describe, it, expect } from "vitest";
import { authorTypeFromRole } from "@/lib/notes/author-type";

describe("authorTypeFromRole", () => {
  it("maps the admin tier to 'admin'", () => {
    expect(authorTypeFromRole("admin")).toBe("admin");
    expect(authorTypeFromRole("compliance_admin")).toBe("admin");
  });

  it("maps clinician + family to themselves", () => {
    expect(authorTypeFromRole("clinician")).toBe("clinician");
    expect(authorTypeFromRole("family")).toBe("family");
  });

  it("maps caregiver-side roles to 'caregiver'", () => {
    expect(authorTypeFromRole("caregiver")).toBe("caregiver");
    expect(authorTypeFromRole("nurse_reviewer")).toBe("caregiver");
  });

  it("defaults unknown / null / ops-tier roles to 'caregiver'", () => {
    expect(authorTypeFromRole(null)).toBe("caregiver");
    expect(authorTypeFromRole(undefined)).toBe("caregiver");
    expect(authorTypeFromRole("")).toBe("caregiver");
    expect(authorTypeFromRole("ops_staff")).toBe("caregiver");
    expect(authorTypeFromRole("billing_staff")).toBe("caregiver");
    expect(authorTypeFromRole("unrecognized")).toBe("caregiver");
  });
});
