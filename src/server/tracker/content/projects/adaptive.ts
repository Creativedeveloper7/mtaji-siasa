/**
 * Writes that survive a database where a §17 migration has not shipped yet.
 *
 * Shared by the projects and leaders slices. A write is retried only when
 * PostgREST / Postgres reports a missing column AND the message names one of
 * the given NEW columns; anything else (RLS, a typo'd column, a check
 * constraint) fails as it is. The columns of one migration ship together, so
 * once one of them is reported missing the whole group is dropped and the
 * write is retried once. Columns that carried data are reported back so the
 * caller can tell the user what was not saved.
 */

export type WritePayload = Record<string, unknown>;

export interface DbError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

/**
 * The missing column named by a PostgREST / Postgres error, or null.
 * - PGRST204: `Could not find the 'start_date' column of 'initiatives' in the schema cache`
 * - 42703: `column "start_date" of relation "initiatives" does not exist`,
 *   `column initiatives.start_date does not exist`
 */
export function missingColumnName(error: DbError | null | undefined): string | null {
  if (!error) return null;
  const message = error.message ?? "";
  if (error.code === "PGRST204" || /Could not find the '/.test(message)) {
    const match = /Could not find the '([^']+)' column/.exec(message);
    if (match) return match[1];
  }
  if (error.code === "42703" || /column .* does not exist/i.test(message)) {
    const match = /column\s+"?(?:[A-Za-z0-9_]+\.)?"?([A-Za-z0-9_]+)"?(?:\s+of relation\s+"?[A-Za-z0-9_.]+"?)?\s+does not exist/i.exec(
      message
    );
    if (match) return match[1];
  }
  return null;
}

/** True when a value would actually store something (null, "", [] and {} do not). */
export function carriesData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export interface AdaptiveResult<T> {
  result: DbResult<T>;
  /** NEW columns left out of the write because the database does not have them yet. */
  dropped: string[];
  /** Of `dropped`, the ones whose value carried data that was therefore not saved. */
  lost: string[];
}

/**
 * Runs `attempt(payload)`. When it fails because one of `newColumns` is
 * missing, runs it once more without any of `newColumns`.
 */
export async function writeAdaptive<T>(
  attempt: (payload: WritePayload) => PromiseLike<DbResult<T>>,
  payload: WritePayload,
  newColumns: readonly string[]
): Promise<AdaptiveResult<T>> {
  const first = await attempt(payload);
  const missing = missingColumnName(first.error);
  if (!first.error || !missing || !newColumns.includes(missing)) {
    return { result: first, dropped: [], lost: [] };
  }
  const present = newColumns.filter((column) => column in payload);
  if (present.length === 0) return { result: first, dropped: [], lost: [] };
  const retry: WritePayload = { ...payload };
  for (const column of present) delete retry[column];
  const result = await attempt(retry);
  return {
    result,
    dropped: present,
    lost: present.filter((column) => carriesData(payload[column])),
  };
}

/** Server-side note for a write that lost NEW-column data. */
export function droppedColumnsWarning(table: string, lost: readonly string[]): string {
  return `Tracker ${table}: not saved because the database migration has not been applied yet: ${lost.join(", ")}.`;
}
