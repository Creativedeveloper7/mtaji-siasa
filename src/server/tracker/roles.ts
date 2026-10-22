import type { UserRole } from "@/types/auth";

/** user_profiles.user_type values the Tracker allows. */
export type TrackerUserType = "individual" | "political_figure" | "organization" | "government";

const USER_TYPES = new Set<TrackerUserType>([
  "individual",
  "political_figure",
  "organization",
  "government",
]);

/** Roles a person may pick at sign-up. Admin is granted by an admin, never chosen. */
export type SignUpRole = Exclude<UserRole, "admin">;

/**
 * Same normalisation as the Tracker's handle_new_user trigger, so a value read
 * back from user_metadata maps the way the trigger stored it.
 */
export function normalizeUserType(value: unknown): TrackerUserType | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const type = value.trim().toLowerCase();
  if (USER_TYPES.has(type as TrackerUserType)) return type as TrackerUserType;
  if (type === "politician" || type === "political") return "political_figure";
  if (type === "agency" || type === "gov" || type === "ministry") return "government";
  if (type === "ngo" || type === "org" || type === "cbo") return "organization";
  return "individual";
}

export function userTypeForRole(role: SignUpRole): TrackerUserType {
  if (role === "leader" || role === "aspirant") return "political_figure";
  if (role === "organization") return "organization";
  return "individual";
}

export interface RoleFacts {
  /** auth.users.app_metadata.role. Only the service role can write it. */
  appRole?: unknown;
  /** user_profiles.user_type, or user_metadata.user_type when that row is missing. */
  userType?: unknown;
  /** political_figures.status of the user's own row, when there is one. */
  figureStatus?: string | null;
  /** user_metadata.siasa_role: what the person picked at sign-up. */
  siasaRole?: unknown;
}

/**
 * Siasa role from Tracker records (see docs/tracker-backend.md, Roles).
 * siasa_role is user-editable, so it only chooses between leader and aspirant
 * for a political figure who has no political_figures row yet.
 */
export function siasaRoleFor(facts: RoleFacts): UserRole {
  if (facts.appRole === "admin") return "admin";
  const type = normalizeUserType(facts.userType) ?? "individual";
  if (type === "organization" || type === "government") return "organization";
  if (type === "individual") return "citizen";
  if (facts.figureStatus) return facts.figureStatus === "aspirant" ? "aspirant" : "leader";
  return facts.siasaRole === "aspirant" ? "aspirant" : "leader";
}

export interface SignUpMetadata {
  full_name: string;
  phone: string;
  user_type: TrackerUserType;
  siasa_role: SignUpRole;
}

/** user_metadata for auth.signUp. Asking for admin signs the person up as a citizen. */
export function signUpMetadata(input: {
  fullName: string;
  phone: string;
  role: UserRole;
}): SignUpMetadata {
  const role: SignUpRole = input.role === "admin" ? "citizen" : input.role;
  return {
    full_name: input.fullName,
    phone: input.phone,
    user_type: userTypeForRole(role),
    siasa_role: role,
  };
}
