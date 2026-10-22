import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export interface FakeAuth {
  getUser?: () => Promise<unknown>;
  signUp?: (input: unknown) => Promise<unknown>;
  signInWithPassword?: (input: unknown) => Promise<unknown>;
  signOut?: (options?: unknown) => Promise<unknown>;
  exchangeCodeForSession?: (code: string) => Promise<unknown>;
  verifyOtp?: (input: unknown) => Promise<unknown>;
  updateUser?: (input: unknown) => Promise<unknown>;
  admin?: Record<string, (...args: never[]) => Promise<unknown>>;
}

/** Records writes so tests can check what reached the database. */
export interface FakeDb {
  tables: Record<string, Row[]>;
  updates: Array<{ table: string; values: Row; filters: Row }>;
  /** Make every read of this table fail, to test error handling. */
  failing?: string;
  /** Every read, as { table, filters }, so tests can check how queries were narrowed. */
  reads?: Array<{ table: string; filters: Row }>;
}

/**
 * A small in-memory stand-in for the supabase-js query builder: select, eq,
 * in, not(is null), ilike, order, limit, maybeSingle and update, which is all
 * the Tracker account code uses. Updates are recorded and applied to the rows.
 */
export function fakeSupabase(db: FakeDb, auth: FakeAuth = {}): SupabaseClient {
  function from(table: string) {
    const predicates: Array<(row: Row) => boolean> = [];
    const orders: Array<{ column: string; sign: number }> = [];
    const filters: Row = {};
    let max = Infinity;
    let pendingUpdate: Row | null = null;

    const matching = () => (db.tables[table] ?? []).filter((row) => predicates.every((p) => p(row)));
    const rows = () => {
      db.reads?.push({ table, filters: { ...filters } });
      const sorted = [...matching()].sort((a, b) => {
        for (const { column, sign } of orders) {
          const diff = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
          if (diff) return sign * diff;
        }
        return 0;
      });
      return sorted.slice(0, max);
    };
    const failed = () => ({ data: null, error: { message: `${table} is unavailable` } });

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        predicates.push((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters[column] = { in: values };
        predicates.push((row) => values.includes(row[column]));
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator !== "is" || value !== null) throw new Error("fake: only not(col, 'is', null)");
        predicates.push((row) => row[column] != null);
        return builder;
      },
      ilike: (column: string, pattern: string) => {
        filters[column] = { ilike: pattern };
        const source = pattern
          .replace(/\\([\\%_])|([%_])|([.*+?^${}()|[\]])/g, (_m, escaped, wildcard, special) =>
            escaped ? `\\${escaped}` : wildcard ? (wildcard === "%" ? ".*" : ".") : `\\${special}`
          );
        const regex = new RegExp(`^${source}$`, "i");
        predicates.push((row) => typeof row[column] === "string" && regex.test(row[column] as string));
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orders.push({ column, sign: options?.ascending === false ? -1 : 1 });
        return builder;
      },
      limit: (count: number) => {
        max = count;
        return builder;
      },
      maybeSingle: async () => {
        if (db.failing === table) return failed();
        const found = rows();
        if (found.length > 1) return { data: null, error: { message: "multiple rows" } };
        return { data: found[0] ?? null, error: null };
      },
      update: (values: Row) => {
        pendingUpdate = values;
        return builder;
      },
      then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
        try {
          if (pendingUpdate) {
            db.updates.push({ table, values: pendingUpdate, filters: { ...filters } });
            for (const row of matching()) Object.assign(row, pendingUpdate);
            resolve({ data: null, error: null });
            return;
          }
          resolve(db.failing === table ? failed() : { data: rows(), error: null });
        } catch (error) {
          reject?.(error);
        }
      },
    };
    return builder;
  }
  return { from, auth } as unknown as SupabaseClient;
}
