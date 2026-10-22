import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthSession } from "@/types/auth";
import type { PublicUser } from "@/server/domain";
import { siasaRoleFor } from "@/server/tracker/roles";

export type AuthUser = Pick<User, "id" | "email" | "created_at" | "app_metadata" | "user_metadata">;

export interface ProfileRow {
  id?: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface UserProfileRow {
  user_id?: string;
  user_type: string | null;
  phone: string | null;
}

export interface FigureRow {
  id: string;
  user_id?: string | null;
  status: string | null;
}

/** The Tracker records one Siasa account is built from. */
export interface AccountRows {
  user: AuthUser;
  profile?: ProfileRow | null;
  userProfile?: UserProfileRow | null;
  figure?: FigureRow | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toAccount({ user, profile, userProfile, figure }: AccountRows): PublicUser {
  const meta = user.user_metadata ?? {};
  const email = text(user.email) || text(profile?.email);
  return {
    id: user.id,
    fullName:
      text(profile?.name) || text(meta.full_name) || text(meta.name) || email.split("@")[0] || "",
    email,
    phone: text(profile?.phone) || text(userProfile?.phone) || text(meta.phone),
    role: siasaRoleFor({
      appRole: user.app_metadata?.role,
      userType: userProfile?.user_type ?? meta.user_type,
      figureStatus: figure?.status,
      siasaRole: meta.siasa_role,
    }),
    createdAt: user.created_at ?? "",
    leaderId: figure?.id,
  };
}

export function toSession(account: PublicUser): AuthSession {
  return {
    userId: account.id,
    email: account.email,
    fullName: account.fullName,
    role: account.role,
    leaderId: account.leaderId,
  };
}

/**
 * Read the profile rows for one user. With a user client RLS lets a person see
 * their own user_profiles and political_figures rows; profiles is public.
 */
export async function loadAccountRows(client: SupabaseClient, user: AuthUser): Promise<AccountRows> {
  const [profile, userProfile, figure] = await Promise.all([
    client.from("profiles").select("id, name, email, phone").eq("id", user.id).maybeSingle(),
    client
      .from("user_profiles")
      .select("user_id, user_type, phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    client
      .from("political_figures")
      .select("id, user_id, status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const failed = profile.error ?? userProfile.error ?? figure.error;
  if (failed) throw new Error(`Could not load the account: ${failed.message}`);
  return {
    user,
    profile: profile.data as ProfileRow | null,
    userProfile: userProfile.data as UserProfileRow | null,
    figure: figure.data as FigureRow | null,
  };
}
