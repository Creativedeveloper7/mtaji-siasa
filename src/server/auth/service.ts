import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthSession, UserRole } from "@/types/auth";
import type { PublicUser } from "@/server/domain";
import { slugify } from "@/lib/store";
import { getRepositories, usesTracker } from "@/server";
import { TrackerConfigError, userClient } from "@/server/tracker/clients";
import {
  loadAccountRows,
  toAccount,
  toSession,
  type AuthUser,
} from "@/server/tracker/accounts";
import { signUpMetadata } from "@/server/tracker/roles";

const ROLES = new Set<UserRole>([
  "citizen",
  "leader",
  "aspirant",
  "organization",
  "admin",
]);

const MIN_PASSWORD = 6;

export type AuthFailure = { ok: false; error: string; status: number };

export type AuthResult = { ok: true; session: AuthSession } | AuthFailure;

/** Sign-up with email confirmation on returns no session until the emailed link is used. */
export type SignUpResult = AuthResult | { ok: true; needsConfirmation: true };

export interface SignUpInput {
  fullName: unknown;
  email: unknown;
  phone: unknown;
  password: unknown;
  role: unknown;
}

const NOT_CONFIGURED: AuthFailure = {
  ok: false,
  error:
    "Accounts need the M-Taji Tracker backend. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  status: 503,
};

function fail(error: string, status: number): AuthFailure {
  return { ok: false, error, status };
}

/** Build the session from Tracker rows. The caller has confirmed `user` with Supabase Auth. */
async function sessionFromUser(client: SupabaseClient, user: AuthUser): Promise<AuthSession> {
  const session = toSession(toAccount(await loadAccountRows(client, user)));
  return withPhase1Leader(session);
}

/**
 * Phase 2: leaders move to political_figures. Until then a politician with no
 * political_figures row gets a leader profile in the memory content store,
 * keyed by their Supabase user id (see ensurePoliticianProfile).
 */
async function withPhase1Leader(session: AuthSession): Promise<AuthSession> {
  if (session.leaderId) return session;
  const linked = await getRepositories().content.findLeader(session.userId);
  return linked ? { ...session, leaderId: linked.id } : session;
}

/** The signed-in user, verified with auth.getUser() (never read from the cookie alone). */
export async function currentSession(): Promise<AuthSession | null> {
  if (!usesTracker()) return null;
  const client = await userClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return sessionFromUser(client, data.user);
}

export async function signIn(email: unknown, password: unknown): Promise<AuthResult> {
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return fail("Invalid email or password.", 401);
  }
  if (!usesTracker()) return NOT_CONFIGURED;
  const client = await userClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed" || /not confirmed/i.test(error?.message ?? "")) {
      return fail("Confirm your email first. Use the link we sent when you signed up.", 403);
    }
    return fail("Invalid email or password.", 401);
  }
  return { ok: true, session: await sessionFromUser(client, data.user) };
}

export async function signUp(input: SignUpInput, origin: string): Promise<SignUpResult> {
  if (
    typeof input.fullName !== "string" ||
    typeof input.email !== "string" ||
    typeof input.phone !== "string" ||
    typeof input.password !== "string"
  ) {
    return fail("Name, email, phone, and password are required.", 400);
  }
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!fullName || !email || !phone || !input.password) {
    return fail("Name, email, phone, and password are required.", 400);
  }
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return fail("Enter a valid email address.", 400);
  }
  if (input.password.length < MIN_PASSWORD) {
    return fail(`Password must be at least ${MIN_PASSWORD} characters.`, 400);
  }
  if (typeof input.role !== "string" || !ROLES.has(input.role as UserRole)) {
    return fail("Choose a valid account role.", 400);
  }
  if (!usesTracker()) return NOT_CONFIGURED;

  const client = await userClient();
  const { data, error } = await client.auth.signUp({
    email,
    password: input.password,
    options: {
      // The Tracker triggers create profiles and user_profiles from this metadata.
      data: signUpMetadata({ fullName, phone, role: input.role as UserRole }),
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) {
    if (error.code === "user_already_exists" || /already (registered|exists)/i.test(error.message)) {
      return fail("An account with this email already exists.", 409);
    }
    return fail(error.message || "Could not create the account.", 400);
  }
  // With confirmation on, an existing email comes back as a user with no identities.
  if (!data.user || data.user.identities?.length === 0) {
    return fail("An account with this email already exists.", 409);
  }
  if (!data.session) return { ok: true, needsConfirmation: true };

  // The triggers do not copy the phone. Best effort: it is also in user_metadata.
  await client.from("profiles").update({ phone }).eq("id", data.user.id);
  return { ok: true, session: await sessionFromUser(client, data.user) };
}

export async function signOut(): Promise<void> {
  if (!usesTracker()) return;
  const client = await userClient();
  await client.auth.signOut();
}

/** Run an admin directory call, turning a missing service role key into a 503. */
async function adminCall<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | AuthFailure> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof TrackerConfigError) return fail(error.message, 503);
    return fail(error instanceof Error ? error.message : "Could not reach the user directory.", 502);
  }
}

export async function listDirectory(): Promise<{ ok: true; users: PublicUser[] } | AuthFailure> {
  const result = await adminCall(() => getRepositories().users.listPublic());
  return result.ok ? { ok: true, users: result.value } : result;
}

export async function adminUpsertUser(body: unknown): Promise<AuthResult> {
  if (!body || typeof body !== "object") {
    return fail("User body must be an object.", 400);
  }
  const input = body as Record<string, unknown>;
  const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role;
  if (!fullName || !email || !phone) {
    return fail("Name, email, and phone are required.", 400);
  }
  if (typeof role !== "string" || !ROLES.has(role as UserRole)) {
    return fail("Choose a valid account role.", 400);
  }
  if (password && password.length < MIN_PASSWORD) {
    return fail(`Password must be at least ${MIN_PASSWORD} characters.`, 400);
  }
  const leaderId =
    typeof input.leaderId === "string" && input.leaderId.trim()
      ? input.leaderId.trim()
      : undefined;
  const requestedId = typeof input.id === "string" ? input.id.trim() : "";
  const users = getRepositories().users;

  const result = await adminCall(async (): Promise<AuthResult> => {
    const existing = requestedId ? await users.findById(requestedId) : undefined;
    if (!existing) {
      if (!password) {
        return fail(`Password must be at least ${MIN_PASSWORD} characters.`, 400);
      }
      const created = await users.create({
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
    const updated = await users.update({
      ...existing,
      fullName,
      email,
      phone,
      role: role as UserRole,
      leaderId,
    });
    if (!updated) return fail("User not found.", 404);
    if (password) await users.setPassword(updated.id, password);
    return { ok: true, session: toSession(updated) };
  });
  if (!result.ok) return result.status === 502 ? { ...result, status: 409 } : result;
  return result.value;
}

export async function adminDeleteUser(
  actorUserId: string,
  id: string
): Promise<AuthFailure | { ok: true }> {
  if (!id) return fail("id is required.", 400);
  if (actorUserId === id) {
    return fail("You cannot delete the account you are signed in with.", 400);
  }
  const result = await adminCall(() => getRepositories().users.delete(id));
  if (!result.ok) return result;
  if (!result.value) return fail("User not found.", 404);
  return { ok: true };
}

/** Make a citizen or organization a political figure, as the old dashboard flow did. */
async function promoteToLeader(userId: string): Promise<AuthSession | null> {
  const client = await userClient();
  // RLS lets a user update their own user_profiles row and user_metadata.
  const { error } = await client
    .from("user_profiles")
    .update({ user_type: "political_figure" })
    .eq("user_id", userId);
  if (error) return null;
  await client.auth.updateUser({ data: { user_type: "political_figure", siasa_role: "leader" } });
  return currentSession();
}

/**
 * Open the politician workspace. Phase 2: this moves to political_figures. For
 * now it never creates a political_figures row (Siasa's sign-up does not collect
 * the office and term the Tracker requires). It creates a leader in the memory
 * content store with id = the user's political_figures.id, or their Supabase
 * user id when they have none.
 */
export async function ensurePoliticianProfile(
  current: AuthSession
): Promise<{ ok: true; session: AuthSession; leaderId: string } | AuthFailure> {
  let session: AuthSession | null = current;
  if (session.role === "citizen" || session.role === "organization") {
    session = await promoteToLeader(session.userId);
    if (!session) return fail("Could not switch your account to a politician account.", 502);
  }
  if (session.role !== "leader" && session.role !== "aspirant") {
    return fail("Only a politician account can open a profile.", 403);
  }
  const leaderId = session.leaderId ?? session.userId;
  const content = getRepositories().content;
  if (await content.findLeader(leaderId)) {
    return { ok: true, session: { ...session, leaderId }, leaderId };
  }
  const aspirant = session.role === "aspirant";
  await content.upsertLeader({
    id: leaderId,
    slug: slugify(session.fullName) || leaderId,
    name: session.fullName,
    honorific: aspirant ? "H.E." : "Hon.",
    position: aspirant
      ? "Political aspirant — profile in progress"
      : "Elected leader — profile in progress",
    type: aspirant ? "aspirant" : "elected",
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
    vision: aspirant
      ? {
          statement: "Add your vision statement for citizens to discover.",
          manifesto: [],
          priorities: [],
          proposedProjects: [],
          expectedImpact: [],
        }
      : undefined,
  });
  return { ok: true, session: { ...session, leaderId }, leaderId };
}

export function sessionHasRole(
  session: AuthSession | null,
  roles: readonly UserRole[]
): session is AuthSession {
  return Boolean(session && roles.includes(session.role));
}
