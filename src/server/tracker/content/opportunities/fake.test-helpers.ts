import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityClients } from "./support";
import type { ContentClients } from "@/server/tracker/content/media/session";

type Row = Record<string, unknown>;
type Error = { code?: string; message: string } | null;

export interface FakeCall {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  values?: unknown;
  filters: Array<[string, string, unknown]>;
}

/**
 * Minimal supabase-js stand-in for this slice's tests. `fail` lets a test
 * make one kind of call return an error (once per entry, in order).
 */
export interface FakeState {
  tables: Record<string, Row[]>;
  calls: FakeCall[];
  userId?: string;
  /** app_metadata.role of the signed-in user (e.g. "admin"). */
  appRole?: string;
  /** rpc(name, args) handlers; a missing name answers PGRST202 like PostgREST. */
  rpc?: Record<string, (args: Record<string, unknown>, state: FakeState) => { data: unknown; error: Error }>;
  /** Runs before every query; lets a test change the tables between two requests. */
  beforeQuery?: (call: FakeCall) => void;
  fail?: Array<{ table: string; op: FakeCall["op"]; error: NonNullable<Error>; when?: (call: FakeCall) => boolean }>;
}

export function fakeClient(state: FakeState): SupabaseClient {
  function from(table: string) {
    const call: FakeCall = { table, op: "select", filters: [] };
    let wantRows = false;
    let single: "single" | "maybe" | null = null;
    let orderBy: { column: string; ascending: boolean } | null = null;

    const matches = (row: Row) =>
      call.filters.every(([kind, column, value]) => {
        if (column.includes(".")) return true; // embedded filters: ignored
        if (kind === "eq") return row[column] === value;
        if (kind === "in") return (value as unknown[]).includes(row[column]);
        if (kind === "like") return String(row[column] ?? "").startsWith(String(value).replace(/%$/, ""));
        return true;
      });

    function run(): { data: unknown; error: Error } {
      state.beforeQuery?.(call);
      state.calls.push(call);
      const failure = state.fail?.findIndex((item) => item.table === table && item.op === call.op && (!item.when || item.when(call)));
      if (failure !== undefined && failure >= 0) {
        const [item] = state.fail!.splice(failure, 1);
        return { data: null, error: item.error };
      }
      const rows = (state.tables[table] ??= []);
      let out: Row[] = [];
      if (call.op === "select") out = rows.filter(matches);
      if (call.op === "insert" || call.op === "upsert") {
        const values = (Array.isArray(call.values) ? call.values : [call.values]) as Row[];
        out = values.map((value) => ({ id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`, created_at: "2026-10-22T10:00:00Z", ...value }));
        rows.push(...out);
      }
      if (call.op === "update") {
        out = rows.filter(matches);
        for (const row of out) Object.assign(row, call.values as Row);
      }
      if (call.op === "delete") {
        out = rows.filter(matches);
        state.tables[table] = rows.filter((row) => !out.includes(row));
      }
      if (orderBy) {
        const { column, ascending } = orderBy;
        out = [...out].sort((a, b) => (ascending ? 1 : -1) * String(a[column]).localeCompare(String(b[column])));
      }
      if (single) return { data: out[0] ?? null, error: null };
      if (call.op !== "select" && !wantRows) return { data: null, error: null };
      return { data: out, error: null };
    }

    const builder = {
      select: () => {
        wantRows = true;
        return builder;
      },
      insert: (values: unknown) => Object.assign(call, { op: "insert", values }) && builder,
      upsert: (values: unknown) => Object.assign(call, { op: "upsert", values }) && builder,
      update: (values: unknown) => Object.assign(call, { op: "update", values }) && builder,
      delete: () => Object.assign(call, { op: "delete" }) && builder,
      eq: (column: string, value: unknown) => (call.filters.push(["eq", column, value]), builder),
      in: (column: string, value: unknown) => (call.filters.push(["in", column, value]), builder),
      like: (column: string, value: unknown) => (call.filters.push(["like", column, value]), builder),
      order: (column: string, options?: { ascending?: boolean }) => {
        orderBy = { column, ascending: options?.ascending !== false };
        return builder;
      },
      single: async () => ((single = "single"), run()),
      maybeSingle: async () => ((single = "maybe"), run()),
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

  const auth = {
    getUser: async () =>
      state.userId
        ? {
            data: {
              user: { id: state.userId, app_metadata: state.appRole ? { role: state.appRole } : {}, user_metadata: {} },
            },
            error: null,
          }
        : { data: { user: null }, error: { message: "no session" } },
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const handler = state.rpc?.[name];
    if (!handler) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    return handler(args, state);
  };
  return { from, auth, rpc } as unknown as SupabaseClient;
}

/**
 * ContentClients (media/polls/products) over the same fake. `user` is the
 * signed-in session, `anon` the same tables without a user, `service` either
 * its own state or the same one. Each client carries a `label`.
 */
export function fakeContentClients(state: FakeState, service?: FakeState): ContentClients & { labelOf(c: unknown): string } {
  const labels = new WeakMap<object, string>();
  const make = (label: string, s: FakeState) => {
    const client = fakeClient(s);
    labels.set(client, label);
    return client;
  };
  return {
    anon: () => make("anon", { ...state, userId: undefined, appRole: undefined }),
    user: async () => make("user", state),
    service: () => make("service", service ?? state),
    labelOf: (client) => labels.get(client as object) ?? "?",
  };
}

export function fakeClients(state: FakeState, service?: FakeState): OpportunityClients {
  return {
    reader: async () => fakeClient(state),
    user: async () => fakeClient(state),
    anon: async () => fakeClient({ ...state, userId: undefined }),
    service: async () => fakeClient(service ?? state),
  };
}
