import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

export interface FakeCall {
  client: string;
  table: string;
  op: "select" | "insert" | "update" | "delete";
  values?: Row;
  filters: Array<[string, string, unknown]>;
}

export interface FakeTables {
  tables: Record<string, Row[]>;
  calls: FakeCall[];
  /**
   * Live column lists per table. When set, an insert or update naming any
   * other column fails like PostgREST (PGRST204), e.g. before a migration.
   */
  columns?: Record<string, readonly string[]>;
  /** Runs before every insert / update / delete (to simulate a concurrent edit). */
  beforeWrite?: (call: FakeCall) => void;
}

/** Shared across clients so generated ids never collide within a test file. */
let nextId = 1;

/**
 * Tiny supabase-js stand-in for the leader and project repository tests:
 * select / neq / eq / in / contains / overlaps / order / limit / maybeSingle /
 * single, insert, update, delete. `canSee` stands in for RLS on reads and
 * writes for that client (`op` says which).
 */
export function fakeClient(
  db: FakeTables,
  name: string,
  canSee: (table: string, row: Row, op: FakeCall["op"]) => boolean = () => true,
  user: { id: string; app_metadata?: Record<string, unknown> } | null = null
): SupabaseClient {
  function from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    const orders: Array<[string, boolean]> = [];
    let limit: number | undefined;
    let op: FakeCall["op"] = "select";
    let values: Row | undefined;
    const matching = () =>
      (db.tables[table] ?? []).filter(
        (row) =>
          canSee(table, row, op) &&
          filters.every(([column, kind, value]) => {
            if (kind === "eq") return row[column] === value;
            if (kind === "neq") return row[column] !== value;
            if (kind === "contains") {
              const list = Array.isArray(row[column]) ? (row[column] as unknown[]) : [];
              return (value as unknown[]).every((item) => list.includes(item));
            }
            if (kind === "overlaps") {
              const list = Array.isArray(row[column]) ? (row[column] as unknown[]) : [];
              return (value as unknown[]).some((item) => list.includes(item));
            }
            return (value as unknown[]).includes(row[column]);
          })
      );
    function run(): { data: unknown; error: { message: string; code?: string } | null } {
      const call: FakeCall = { client: name, table, op, values, filters: [...filters] };
      db.calls.push(call);
      if (op !== "select") db.beforeWrite?.(call);
      const known = db.columns?.[table];
      const unknown = known && values ? Object.keys(values).find((column) => !known.includes(column)) : undefined;
      if (unknown) {
        return {
          data: null,
          error: { code: "PGRST204", message: `Could not find the '${unknown}' column of '${table}' in the schema cache` },
        };
      }
      if (op === "insert") {
        const row = { id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`, ...values } as Row;
        if ((db.tables[table] ?? []).some((other) => other.id === row.id)) {
          return { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } };
        }
        if (!canSee(table, row, op)) return { data: null, error: { message: "new row violates row-level security policy" } };
        if (row.user_id && table === "political_figures" && (db.tables[table] ?? []).some((other) => other.user_id === row.user_id)) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
        (db.tables[table] ??= []).push(row);
        return { data: [row], error: null };
      }
      const rows = matching();
      if (op === "update") {
        for (const row of rows) Object.assign(row, values);
        return { data: rows, error: null };
      }
      if (op === "delete") {
        db.tables[table] = (db.tables[table] ?? []).filter((row) => !rows.includes(row));
        return { data: rows, error: null };
      }
      const sorted = [...rows];
      for (const [column, ascending] of [...orders].reverse()) {
        sorted.sort((a, b) => (ascending ? 1 : -1) * String(a[column]).localeCompare(String(b[column])));
      }
      return { data: limit === undefined ? sorted : sorted.slice(0, limit), error: null };
    }
    const builder = {
      select: () => builder,
      insert: (row: Row) => {
        op = "insert";
        values = row;
        return builder;
      },
      update: (row: Row) => {
        op = "update";
        values = row;
        return builder;
      },
      delete: () => {
        op = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => (filters.push([column, "eq", value]), builder),
      neq: (column: string, value: unknown) => (filters.push([column, "neq", value]), builder),
      in: (column: string, value: unknown[]) => (filters.push([column, "in", value]), builder),
      contains: (column: string, value: unknown[]) => (filters.push([column, "contains", value]), builder),
      overlaps: (column: string, value: unknown[]) => (filters.push([column, "overlaps", value]), builder),
      limit: (n: number) => ((limit = n), builder),
      order: (column: string, options?: { ascending?: boolean }) => (
        orders.push([column, options?.ascending !== false]), builder
      ),
      maybeSingle: async () => {
        const result = run();
        return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
      },
      single: async () => {
        const result = run();
        const rows = result.data as Row[] | null;
        if (result.error) return result;
        if (!rows?.length) return { data: null, error: { message: "no rows", code: "PGRST116" } };
        return { data: rows[0], error: null };
      },
      then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
        try {
          resolve(run());
        } catch (error) {
          reject?.(error);
        }
      },
    };
    return builder;
  }
  return {
    from,
    auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: "no session" } }) },
  } as unknown as SupabaseClient;
}
