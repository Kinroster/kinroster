// Phase 2 — author_type derivation.
//
// notes.author_type and voice_sessions.author_type are the four
// CONTRIBUTION classes: caregiver, admin, clinician, family. They
// differ from users.role (which has six staff-side variants).
//
// Centralize the mapping here so every writer (note-input form, voice
// webhook, voice/start, future clinician + family routes) agrees on
// the contract. The DB CHECK enforces the same shape at the column.

export type AuthorType = "caregiver" | "admin" | "clinician" | "family";

/**
 * Map a `users.role` value to the corresponding author_type. The four
 * staff-side roles ('admin', 'compliance_admin', 'caregiver',
 * 'nurse_reviewer') collapse into either 'admin' or 'caregiver' since
 * the thread updater only cares about contribution class.
 *
 * `clinician` and `family` map to themselves — once those roles exist
 * (Phase 3 / 4 add them to users_role_check), routes that authorize
 * those users should pass their role here directly.
 *
 * Unknown / ops-only roles (ops_staff, billing_staff) get 'caregiver'
 * as a defensive default — they should not be creating clinical notes
 * in practice (RLS blocks them via is_staff()), but if a stray write
 * path slips through, an over-broad 'caregiver' tag is safer than
 * inventing a new author_type or writing NULL.
 */
export function authorTypeFromRole(
  role: string | null | undefined
): AuthorType {
  switch (role) {
    case "admin":
    case "compliance_admin":
      return "admin";
    case "clinician":
      return "clinician";
    case "family":
      return "family";
    case "caregiver":
    case "nurse_reviewer":
    case "ops_staff":
    case "billing_staff":
    default:
      return "caregiver";
  }
}
