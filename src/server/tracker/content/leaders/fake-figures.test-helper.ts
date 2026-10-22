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
}

/**
 * Tiny supabase-js stand-in for the leader repository tests: select / neq /
 * eq / in / order / maybeSingle / single, insert, update, delete. `canSee`
 * stands in for RLS on reads and writes for that client.
 */
export function fakeClient(
  db: FakeTables,
  name: string,
  canSee: (table: string, row: Row) => boolean = () => true,
  user: { id: string; app_metadata?: Record<string, unknown> } | null = null
): SupabaseClient {
  let nextId = 1;
  function from(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    const orders: Array<[string, boolean]> = [];
    let op: FakeCall["op"] = "select";
    let values: Row | undefined;
    const matching = () =>
      (db.tables[table] ?? []).filter(
        (row) =>
          canSee(table, row) &&
          filters.every(([column, kind, value]) => {
            if (kind === "eq") return row[column] === value;
            if (kind === "neq") return row[column] !== value;
            return (value as unknown[]).includes(row[column]);
          })
      );
    function run(): { data: unknown; error: { message: string; code?: string } | null } {
      db.calls.push({ client: name, table, op, values, filters: [...filters] });
      if (op === "insert") {
        const row = { id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`, ...values } as Row;
        if (!canSee(table, row)) return { data: null, error: { message: "new row violates row-level security policy" } };
        if (row.user_id && (db.tables[table] ?? []).some((other) => other.user_id === row.user_id)) {
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
      return { data: sorted, error: null };
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
