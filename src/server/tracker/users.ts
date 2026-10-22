import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRepository } from "@/server/repositories";
import type { PublicUser } from "@/server/domain";
import { anonClient, hasServiceRole, serviceClient, userClient } from "@/server/tracker/clients";
import {
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

function check(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

/** Every auth user. auth.admin needs the service role. */
async function listAuthUsers(admin: SupabaseClient): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE });
    check(error, "Could not list users");
    users.push(...data.users);
    if (data.users.length < PAGE) return users;
  }
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
      const [users, profiles, userProfiles, figures] = await Promise.all([
        listAuthUsers(admin),
        admin.from("profiles").select("id, name, email, phone"),
        admin.from("user_profiles").select("user_id, user_type, phone"),
        admin
          .from("political_figures")
          .select("id, user_id, status")
          .not("user_id", "is", null)
          .order("created_at", { ascending: true }),
      ]);
      check(profiles.error ?? userProfiles.error ?? figures.error, "Could not load profiles");
      const profileBy = new Map((profiles.data as ProfileRow[]).map((row) => [row.id, row]));
      const userProfileBy = new Map(
        (userProfiles.data as UserProfileRow[]).map((row) => [row.user_id, row])
      );
      // Ascending order: the newest row per user wins, as in loadAccountRows.
      const figureBy = new Map((figures.data as FigureRow[]).map((row) => [row.user_id, row]));
      return users
        .map((user) =>
          toAccount({
            user,
            profile: profileBy.get(user.id),
            userProfile: userProfileBy.get(user.id),
            figure: figureBy.get(user.id),
          })
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    findById,

    findByEmail: async (email) => {
      const admin = serviceClient();
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .ilike("email", email.trim().toLowerCase())
        .limit(1)
        .maybeSingle();
      check(error, "Could not look up the email");
      return data ? findById((data as { id: string }).id) : undefined;
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
      if (!created) throw new Error("The new user could not be read back.");
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
