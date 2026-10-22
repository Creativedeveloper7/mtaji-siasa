import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRepository } from "@/server/repositories";
import type { PublicUser } from "@/server/domain";
import { anonClient, hasServiceRole, serviceClient, userClient } from "@/server/tracker/clients";
import {
  compareFigures,
  loadAccountRows,
  toAccount,
  type AuthUser,
  type FigureRow,
  type ProfileRow,
  type UserProfileRow,
} from "@/server/tracker/accounts";
import { signUpMetadata, userTypeForRole } from "@/server/tracker/roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

/**
 * A user directory call failed. `status` drives the API answer through
 * failureFromError (src/server/http-errors.ts): a 400 or 409 message is written
 * for people and is shown; a 502 is logged and answered with a generic message, so
 * Auth and database text never reach the browser.
 */
export class TrackerUserError extends Error {
  constructor(
    readonly status: 400 | 409 | 502,
    message: string
  ) {
    super(message);
    this.name = "TrackerUserError";
  }
}

type DirectoryError = { message: string; code?: string; status?: number };

/** Duplicate email: GoTrue email_exists / user_already_exists, or a Postgres unique violation. */
function isConflict(error: DirectoryError): boolean {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    error.code === "23505" ||
    /already (been )?(registered|exists)|duplicate key/i.test(error.message)
  );
}

/** GoTrue's 400/422 answers for an input the person can fix. */
const INPUT_STATUSES = new Set([400, 422]);

/**
 * A weak or invalid password: GoTrue weak_password, or (older GoTrue, no code)
 * a 400/422 whose text starts with "Password ".
 */
function isWeakPassword(error: DirectoryError): boolean {
  return (
    error.code === "weak_password" ||
    (INPUT_STATUSES.has(error.status ?? 0) && /^Password /.test(error.message ?? ""))
  );
}

/** An email GoTrue will not accept: email_address_invalid, or a 400/422 that says so. */
function isInvalidEmail(error: DirectoryError): boolean {
  return (
    error.code === "email_address_invalid" ||
    (INPUT_STATUSES.has(error.status ?? 0) && /invalid.*email|email.*invalid/i.test(error.message ?? ""))
  );
}

/**
 * Same rules as signUpFailure (src/server/auth/service.ts): a duplicate email
 * is a 409, a weak password or invalid email a 400 with a message for people,
 * anything else a 502 (logged, generic answer).
 */
function check(error: DirectoryError | null, action: string) {
  if (!error) return;
  if (isConflict(error)) throw new TrackerUserError(409, "An account with this email already exists.");
  if (isWeakPassword(error)) {
    // GoTrue's weak password text lists the requirements and is written for people.
    const message = error.message ?? "";
    throw new TrackerUserError(400, /^Password /.test(message) ? message : "Choose a stronger password.");
  }
  if (isInvalidEmail(error)) throw new TrackerUserError(400, "Enter a valid email address.");
  throw new TrackerUserError(502, `${action}: ${error.message}`);
}

/** Ids per `.in()` filter: keeps each PostgREST request URL well under proxy limits. */
const IN_CHUNK = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Every auth user, one listUsers page at a time. auth.admin needs the service role. */
async function* authUserPages(admin: SupabaseClient): AsyncGenerator<AuthUser[]> {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    check(error, "Could not list users");
    if (data.users.length) yield data.users;
    if (data.users.length < PAGE) return;
  }
}

/**
 * The profile rows of these users only. Selecting whole tables would stop at
 * PostgREST's row cap (1000) and silently drop accounts.
 */
async function profileRowsFor(admin: SupabaseClient, ids: string[]) {
  const profiles: ProfileRow[] = [];
  const userProfiles: UserProfileRow[] = [];
  const figures: FigureRow[] = [];
  for (const part of chunks(ids, IN_CHUNK)) {
    const [p, up, f] = await Promise.all([
      admin.from("profiles").select("id, name, email, phone").in("id", part),
      admin.from("user_profiles").select("user_id, user_type, phone").in("user_id", part),
      admin
        .from("political_figures")
        .select("id, user_id, status, created_at")
        .in("user_id", part),
    ]);
    check(p.error ?? up.error ?? f.error, "Could not load profiles");
    profiles.push(...((p.data ?? []) as ProfileRow[]));
    userProfiles.push(...((up.data ?? []) as UserProfileRow[]));
    figures.push(...((f.data ?? []) as FigureRow[]));
  }
  return { profiles, userProfiles, figures };
}

/** LIKE pattern that matches `text` literally (no % or _ wildcards). */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function findAuthUser(admin: SupabaseClient, id: string): Promise<AuthUser | undefined> {
  if (!UUID.test(id)) return undefined;
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) return undefined;
  return data.user;
}

/**
 * Accounts are Supabase Auth users plus the Tracker's profiles, user_profiles
 * and political_figures rows. The directory and admin edits use the service
 * role: RLS only lets a user read their own user_profiles row, and only the
 * service role may write app_metadata (where admin lives).
 */
export function createTrackerUserRepository(): UserRepository {
  async function findById(id: string): Promise<PublicUser | undefined> {
    if (!hasServiceRole()) {
      // Without the service role a user can still read their own account.
      const client = await userClient();
      const { data } = await client.auth.getUser();
      if (data.user?.id === id) return toAccount(await loadAccountRows(client, data.user));
    }
    const admin = serviceClient();
    const user = await findAuthUser(admin, id);
    return user ? toAccount(await loadAccountRows(admin, user)) : undefined;
  }

  return {
    count: async () => {
      // profiles is publicly readable, so a head count needs no service role.
      const { count, error } = await anonClient()
        .from("profiles")
        .select("id", { count: "exact", head: true });
      check(error, "Could not count users");
      return count ?? 0;
    },

    listPublic: async () => {
      const admin = serviceClient();
      const accounts: PublicUser[] = [];
      for await (const users of authUserPages(admin)) {
        const rows = await profileRowsFor(
          admin,
          users.map((user) => user.id)
        );
        const profileBy = new Map(rows.profiles.map((row) => [row.id, row]));
        const userProfileBy = new Map(rows.userProfiles.map((row) => [row.user_id, row]));
        // Same pick as loadAccountRows: the oldest row per user (ties by id).
        const figureBy = new Map<string, FigureRow>();
        for (const row of [...rows.figures].sort(compareFigures)) {
          if (row.user_id && !figureBy.has(row.user_id)) figureBy.set(row.user_id, row);
        }
        for (const user of users) {
          accounts.push(
            toAccount({
              user,
              profile: profileBy.get(user.id),
              userProfile: userProfileBy.get(user.id),
              figure: figureBy.get(user.id),
            })
          );
        }
      }
      return accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    findById,

    findByEmail: async (email) => {
      const wanted = email.trim().toLowerCase();
      if (!wanted) return undefined;
      const admin = serviceClient();
      // Case-insensitive but literal: % and _ are escaped, and the exact
      // lower-case comparison below drops anything else ilike lets through.
      const { data, error } = await admin
        .from("profiles")
        .select("id, email")
        .ilike("email", likeLiteral(wanted))
        .limit(10);
      check(error, "Could not look up the email");
      const match = ((data ?? []) as Array<{ id: string; email: string | null }>).find(
        (row) => (row.email ?? "").trim().toLowerCase() === wanted
      );
      return match ? findById(match.id) : undefined;
    },

    create: async (input) => {
      const admin = serviceClient();
      const metadata = signUpMetadata(input);
      // The Tracker triggers create the profiles and user_profiles rows.
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: input.role === "admin" ? { role: "admin" } : {},
      });
      check(error, "Could not create the user");
      const id = data.user!.id;
      const phone = await admin.from("profiles").update({ phone: metadata.phone }).eq("id", id);
      check(phone.error, "Could not save the phone number");
      const created = await findById(id);
      if (!created) throw new TrackerUserError(502, "The new user could not be read back.");
      return created;
    },

    update: async (account) => {
      const admin = serviceClient();
      const existing = await findAuthUser(admin, account.id);
      if (!existing) return undefined;
      const email = account.email.trim().toLowerCase();
      const isAdmin = account.role === "admin";
      // Admin is a grant on top of the account type, so it keeps the user_type.
      const typeChange =
        account.role === "admin"
          ? {}
          : { user_type: userTypeForRole(account.role), siasa_role: account.role };
      const { error } = await admin.auth.admin.updateUserById(account.id, {
        email: email !== existing.email ? email : undefined,
        user_metadata: {
          ...existing.user_metadata,
          full_name: account.fullName.trim(),
          phone: account.phone.trim(),
          ...typeChange,
        },
        app_metadata: { ...existing.app_metadata, role: isAdmin ? "admin" : null },
      });
      check(error, "Could not update the user");
      const profile = await admin
        .from("profiles")
        .update({ name: account.fullName.trim(), email, phone: account.phone.trim() })
        .eq("id", account.id);
      check(profile.error, "Could not update the profile");
      if ("user_type" in typeChange) {
        const userProfile = await admin
          .from("user_profiles")
          .update({ user_type: typeChange.user_type, phone: account.phone.trim() })
          .eq("user_id", account.id);
        check(userProfile.error, "Could not update the account type");
      }
      // leaderId is not written: it is the user's political_figures.id.
      return findById(account.id);
    },

    setPassword: async (id, password) => {
      const admin = serviceClient();
      if (!(await findAuthUser(admin, id))) return false;
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      check(error, "Could not set the password");
      return true;
    },

    delete: async (id) => {
      const admin = serviceClient();
      if (!(await findAuthUser(admin, id))) return false;
      const { error } = await admin.auth.admin.deleteUser(id);
      check(error, "Could not delete the user");
      return true;
    },
  };
}
