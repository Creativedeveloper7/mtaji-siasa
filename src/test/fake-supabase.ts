import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export interface FakeAuth {
  getUser?: () => Promise<unknown>;
  signUp?: (input: unknown) => Promise<unknown>;
  signInWithPassword?: (input: unknown) => Promise<unknown>;
}

/** Records writes so tests can check what reached the database. */
export interface FakeDb {
  tables: Record<string, Row[]>;
  updates: Array<{ table: string; values: Row; filters: Row }>;
  /** Make every read of this table fail, to test error handling. */
  failing?: string;
}

/**
 * A small in-memory stand-in for the supabase-js query builder: select, eq,
 * order, limit, maybeSingle and update, which is all the Tracker account code uses.
 */
export function fakeSupabase(db: FakeDb, auth: FakeAuth = {}): SupabaseClient {
  function from(table: string) {
    let rows = [...(db.tables[table] ?? [])];
    const filters: Row = {};
    let pendingUpdate: Row | null = null;
    const result = () =>
      db.failing === table
        ? { data: null, error: { message: `${table} is unavailable` } }
        : { data: rows[0] ?? null, error: null };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        const sign = options?.ascending === false ? -1 : 1;
        rows.sort((a, b) => sign * String(a[column]).localeCompare(String(b[column])));
        return builder;
      },
      limit: (count: number) => {
        rows = rows.slice(0, count);
        return builder;
      },
      maybeSingle: async () => result(),
      update: (values: Row) => {
        pendingUpdate = values;
        return builder;
      },
      then: (resolve: (value: unknown) => void) => {
        if (pendingUpdate) db.updates.push({ table, values: pendingUpdate, filters: { ...filters } });
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }
  return { from, auth } as unknown as SupabaseClient;
}
