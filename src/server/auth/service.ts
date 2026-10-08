import type { AuthSession, UserRole } from "@/types/auth";
import type { PublicUser } from "@/server/domain";
import { createId, slugify } from "@/lib/store";
import { getRepositories } from "@/server";

const ROLES = new Set<UserRole>([
  "citizen",
  "leader",
  "aspirant",
  "organization",
  "admin",
]);

export type AuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: string; status: number };

export interface SignUpInput {
  fullName: unknown;
  email: unknown;
  phone: unknown;
  password: unknown;
  role: unknown;
  leaderId?: unknown;
}

function toSession(user: PublicUser): AuthSession {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    leaderId: user.leaderId,
  };
}

export function signIn(email: unknown, password: unknown): AuthResult {
  if (typeof email !== "string" || typeof password !== "string") {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }
  const users = getRepositories().users;
  if (!users.verifyPassword(email, password)) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }
  const account = users.findByEmail(email);
  if (!account) {
    return { ok: false, error: "Invalid email or password.", status: 401 };
  }
  return { ok: true, session: toSession(account) };
}

export function signUp(input: SignUpInput): AuthResult {
  if (
    typeof input.fullName !== "string" ||
    typeof input.email !== "string" ||
    typeof input.phone !== "string" ||
    typeof input.password !== "string"
  ) {
    return {
      ok: false,
      error: "Name, email, phone, and password are required.",
      status: 400,
    };
  }
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!fullName || !email || !phone || !input.password) {
    return {
      ok: false,
      error: "Name, email, phone, and password are required.",
      status: 400,
    };
  }
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return { ok: false, error: "Enter a valid email address.", status: 400 };
  }
  if (input.password.length < 6) {
    return {
      ok: false,
      error: "Password must be at least 6 characters.",
      status: 400,
    };
  }
  if (typeof input.role !== "string" || !ROLES.has(input.role as UserRole)) {
    return { ok: false, error: "Choose a valid account role.", status: 400 };
  }
  const role: UserRole = input.role === "admin" ? "citizen" : (input.role as UserRole);
  const leaderId =
    typeof input.leaderId === "string" && input.leaderId.trim()
      ? input.leaderId.trim()
      : undefined;
  const users = getRepositories().users;
  if (users.findByEmail(email)) {
    return {
      ok: false,
      error: "An account with this email already exists.",
      status: 409,
    };
  }
  const account = users.create({
    fullName,
    email,
    phone,
    password: input.password,
    role,
    leaderId,
  });
  return { ok: true, session: toSession(account) };
}

export function listDirectory(): PublicUser[] {
  return getRepositories().users.listPublic();
}

export function adminUpsertUser(body: unknown): AuthResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "User body must be an object.", status: 400 };
  }
  const input = body as Record<string, unknown>;
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role;
  if (!fullName || !email || !phone) {
    return { ok: false, error: "Name, email, and phone are required.", status: 400 };
  }
  if (typeof role !== "string" || !ROLES.has(role as UserRole)) {
    return { ok: false, error: "Choose a valid account role.", status: 400 };
  }
  const leaderId =
    typeof input.leaderId === "string" && input.leaderId.trim()
      ? input.leaderId.trim()
      : undefined;
  const users = getRepositories().users;
  const requestedId = typeof input.id === "string" ? input.id.trim() : "";
  const existing = requestedId ? users.findById(requestedId) : undefined;
  try {
    if (!existing) {
      if (password.length < 6) {
        return { ok: false, error: "Password must be at least 6 characters.", status: 400 };
      }
      const created = users.create({
        id: requestedId || undefined,
        fullName,
        email,
        phone,
        password,
        role: role as UserRole,
        leaderId,
      });
      return { ok: true, session: toSession(created) };
    }
    if (password && password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters.", status: 400 };
    }
    const updated = users.update({
      ...existing,
      fullName,
      email,
      phone,
      role: role as UserRole,
      leaderId,
    });
    if (!updated) return { ok: false, error: "User not found.", status: 404 };
    if (password) users.setPassword(updated.id, password);
    const fresh = users.findById(updated.id);
    return { ok: true, session: toSession(fresh ?? updated) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the user.";
    return { ok: false, error: message, status: 409 };
  }
}

export function adminDeleteUser(actorUserId: string, id: string): AuthResult | { ok: true; session?: undefined } {
  if (!id) return { ok: false, error: "id is required.", status: 400 };
  if (actorUserId === id) {
    return { ok: false, error: "You cannot delete the account you are signed in with.", status: 400 };
  }
  const removed = getRepositories().users.delete(id);
  if (!removed) return { ok: false, error: "User not found.", status: 404 };
  return { ok: true };
}

export function ensurePoliticianProfile(userId: string):
  | { ok: true; session: AuthSession; leaderId: string }
  | { ok: false; error: string; status: number } {
  const users = getRepositories().users;
  let account = users.findById(userId);
  if (!account) return { ok: false, error: "Sign in required.", status: 401 };
  if (account.role === "citizen" || account.role === "organization") {
    account = users.update({ ...account, role: "leader" }) ?? {
      ...account,
      role: "leader",
    };
  }
  if (account.role !== "leader" && account.role !== "aspirant") {
    return { ok: false, error: "Only a politician account can open a profile.", status: 403 };
  }
  const content = getRepositories().content;
  if (account.leaderId && content.findLeader(account.leaderId)) {
    return { ok: true, session: toSession(account), leaderId: account.leaderId };
  }
  const match = content
    .listLeaders()
    .find((leader) => leader.name.toLowerCase() === account.fullName.toLowerCase());
  if (match) {
    const linked = users.update({ ...account, leaderId: match.id });
    return {
      ok: true,
      session: toSession(linked ?? { ...account, leaderId: match.id }),
      leaderId: match.id,
    };
  }
  const id = createId("ldr");
  const leader = content.upsertLeader({
    id,
    slug: slugify(account.fullName) || id,
    name: account.fullName,
    honorific: account.role === "aspirant" ? "H.E." : "Hon.",
    position:
      account.role === "aspirant"
        ? "Political aspirant — profile in progress"
        : "Elected leader — profile in progress",
    type: account.role === "aspirant" ? "aspirant" : "elected",
    county: "Nairobi",
    photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    shortBio: "Complete your profile to showcase your development record.",
    bio: "Welcome to your M-Taji Siasa politician workspace. Update your biography, publish projects with GIS evidence, and engage citizens through Faida.",
    achievements: [],
    social: {},
    projectIds: [],
    opportunityIds: [],
    mediaIds: [],
    pollIds: [],
    productIds: [],
    vision:
      account.role === "aspirant"
        ? {
            statement: "Add your vision statement for citizens to discover.",
            manifesto: [],
            priorities: [],
            proposedProjects: [],
            expectedImpact: [],
          }
        : undefined,
  });
  const linked = users.update({ ...account, leaderId: leader.id });
  return { ok: true, session: toSession(linked ?? { ...account, leaderId: leader.id }), leaderId: leader.id };
}

export function sessionForUserId(userId: string): AuthSession | null {
  const account = getRepositories().users.findById(userId);
  return account ? toSession(account) : null;
}

export function sessionHasRole(
  session: AuthSession | null,
  roles: readonly UserRole[]
): session is AuthSession {
  return Boolean(session && roles.includes(session.role));
}
