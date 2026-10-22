import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients this slice uses. Injected so tests can pass fakes; the
 * defaults load src/server/tracker/clients lazily (it imports next/headers).
 */
export interface OpportunityClients {
  /**
   * Reads of listings: the session client when there is a request (RLS then
   * shows published rows plus the author's own closed ones), else anon.
   */
  reader(): Promise<SupabaseClient>;
  /** The signed-in user's client. RLS decides every write. */
  user(): Promise<SupabaseClient>;
  /** Anon, no session. */
  anon(): Promise<SupabaseClient>;
  /** Service role. Admin-only call sites; each says why. */
  service(): Promise<SupabaseClient>;
}

export function defaultClients(): OpportunityClients {
  const load = () => import("@/server/tracker/clients");
  return {
    reader: async () => {
      const clients = await load();
      try {
        return await clients.userClient();
      } catch (error) {
        // Outside a request (build, static generation) there are no cookies.
        if (error instanceof clients.TrackerConfigError) throw error;
        return clients.anonClient();
      }
    },
    user: async () => (await load()).userClient(),
    anon: async () => (await load()).anonClient(),
    service: async () => (await load()).serviceClient(),
  };
}

export interface DbError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export class TrackerWriteError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

export function check(error: DbError | null, action: string): void {
  if (error) throw new TrackerWriteError(`${action}: ${error.message}`, error.code);
}

/** A column added by a pending migration is missing (PostgREST or Postgres code). */
export function isMissingColumn(error: DbError | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

/** A table added by a pending migration is missing. */
export function isMissingTable(error: DbError | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01";
}

export function isCheckViolation(error: DbError | null): boolean {
  return error?.code === "23514";
}

export function isUniqueViolation(error: DbError | null): boolean {
  return error?.code === "23505";
}

/** The signed-in user's id, confirmed with auth.getUser() (never the cookie alone). */
export async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  const id = data?.user?.id;
  if (error || !id) throw new TrackerWriteError("Sign in to continue.", "not_authenticated");
  return id;
}

/**
 * Runs a write with the M5b/M6 columns, and once more without them when the
 * live schema does not have them yet. `state.extraMissing` remembers the
 * answer for the life of the repository so later writes skip the retry.
 */
export async function writeWithExtra<T>(
  state: { extraMissing: boolean },
  run: (includeExtra: boolean) => PromiseLike<{ data: T | null; error: DbError | null }>
): Promise<{ data: T | null; error: DbError | null }> {
  if (!state.extraMissing) {
    const first = await run(true);
    if (!isMissingColumn(first.error)) return first;
    state.extraMissing = true;
  }
  return run(false);
}
