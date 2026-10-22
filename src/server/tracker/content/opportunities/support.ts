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

/**
 * A write or read the API layer should answer with `status`. When no status
 * is given it follows from `code`: forbidden 403, not_authenticated 401,
 * not_found 404, not_implemented 501, 23505 409, otherwise 500.
 */
export class TrackerWriteError extends Error {
  readonly status: number;
  constructor(
    message: string,
    readonly code?: string,
    status?: number
  ) {
    super(message);
    this.name = "TrackerWriteError";
    this.status = status ?? statusForCode(code);
  }
}

function statusForCode(code: string | undefined): number {
  switch (code) {
    case "forbidden":
    case "42501":
      return 403;
    case "not_authenticated":
      return 401;
    case "not_found":
      return 404;
    case "not_implemented":
      return 501;
    case "23505":
      return 409;
    default:
      return 500;
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
 * Verifies the signed-in user is an admin (app_metadata.role = 'admin', which
 * only the service role can set) with auth.getUser(), before a call site uses
 * the service role. Same check as media's requireCaller/resolveOwner.
 */
export async function requireAdmin(clients: OpportunityClients): Promise<void> {
  let client: SupabaseClient;
  try {
    client = await clients.user();
  } catch {
    throw new TrackerWriteError("Sign in to continue.", "not_authenticated");
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new TrackerWriteError("Sign in to continue.", "not_authenticated");
  if (data.user.app_metadata?.role !== "admin") {
    throw new TrackerWriteError("Only admins can see this.", "forbidden");
  }
}

/** How long a "columns missing" answer is trusted before the full write is tried again. */
export const EXTRA_REPROBE_MS = 60_000;

/** Per-repository memory of the last time the pending-migration columns were missing. */
export interface ExtraColumnsState {
  missingAt?: number;
}

/** True when a column value carries user data (not null, not blank, not an empty list). */
export function carriesData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The PostgREST/Postgres "unknown column" error names one of `columns`. */
function missingOneOf(error: DbError | null, columns: string[]): boolean {
  if (!isMissingColumn(error)) return false;
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  // Without a message we cannot tell which column; assume it is a pending one.
  return !text.trim() || columns.some((column) => text.includes(column));
}

export interface ExtraColumns {
  /** The values of the columns a pending migration adds (as they would be written). */
  values: Record<string, unknown>;
  /** Columns in `values` whose loss is acceptable (e.g. updated_at). They never block the retry. */
  droppable?: string[];
  /** For the 501 message, e.g. "Tracker migration M5b". */
  migration: string;
  now?: () => number;
}

/**
 * Runs a write with the columns of a pending migration, and once more without
 * them when the live schema does not have them yet, but ONLY if those columns
 * carry no data. If they do, it throws a 501 TrackerWriteError naming the
 * fields instead of silently dropping what the user entered (same rule as
 * media's writeBlog).
 *
 * The "missing" answer is remembered for EXTRA_REPROBE_MS only, and only to
 * skip the doomed first attempt for writes that carry no extra data; a write
 * that carries data always tries the full payload, so it succeeds as soon as
 * the migration lands.
 */
export async function writeWithExtra<T>(
  state: ExtraColumnsState,
  extra: ExtraColumns,
  run: (includeExtra: boolean) => PromiseLike<{ data: T | null; error: DbError | null }>
): Promise<{ data: T | null; error: DbError | null }> {
  const clock = extra.now ?? Date.now;
  const columns = Object.keys(extra.values);
  const droppable = new Set(extra.droppable ?? []);
  const withData = columns.filter((column) => !droppable.has(column) && carriesData(extra.values[column]));
  const recentlyMissing = state.missingAt !== undefined && clock() - state.missingAt < EXTRA_REPROBE_MS;

  if (!withData.length && recentlyMissing) return run(false);

  const first = await run(true);
  if (!missingOneOf(first.error, columns)) {
    if (!first.error) state.missingAt = undefined;
    return first;
  }
  state.missingAt = clock();
  if (withData.length) {
    throw new TrackerWriteError(
      `These fields cannot be saved until ${extra.migration} is applied to the Tracker database: ${withData.join(", ")}.`,
      "not_implemented",
      501
    );
  }
  return run(false);
}
