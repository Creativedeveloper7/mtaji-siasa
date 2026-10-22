import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients for the M-Taji Tracker project. Server only: the service
 * role key must never reach the browser, and nothing here may be imported from
 * a client component.
 */

export class TrackerConfigError extends Error {}

function publicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    throw new TrackerConfigError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for the Tracker backend."
    );
  }
  return { url, anonKey };
}

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/**
 * Anon key plus the signed-in user's session cookies. Row-level security
 * decides what the user can read and write. Always confirm the user with
 * auth.getUser(); the cookie alone is not trusted.
 */
export async function userClient(): Promise<SupabaseClient> {
  const { url, anonKey } = publicConfig();
  const jar = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) jar.set(name, value, options);
        } catch {
          // Server components cannot write cookies. Route handlers can, and
          // they refresh the session on the next /api call.
        }
      },
    },
  });
}

/** Anon key, no session. For public reads. */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = publicConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service role. Bypasses row-level security, so it is used only where RLS has
 * no rule for a legitimate action (the admin user directory, admin role
 * changes). Each caller says why.
 */
export function serviceClient(): SupabaseClient {
  const { url } = publicConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new TrackerConfigError(
      "SUPABASE_SERVICE_ROLE_KEY is not set on the server. Admin user management needs it."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
