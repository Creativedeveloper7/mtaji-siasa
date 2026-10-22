/**
 * A small in-memory stand-in for the parts of the Supabase client the Adly
 * repository uses (from().select/insert/update/delete with eq/in/order/limit,
 * single/maybeSingle, storage). Tests only.
 *
 * `ownerId` set = the user's client: adly_campaigns rows are limited to that
 * owner, like the owner-only RLS policy. Unset = the service role.
 */
type Row = Record<string, unknown>;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Count of writes per table (to assert nothing was written). */
  writes: Record<string, number> = {};

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.tables[table] = rows.map(clone);
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  get(table: string, id: string): Row | undefined {
    const row = this.rows(table).find((r) => r.id === id);
    return row ? clone(row) : undefined;
  }

  client(ownerId?: string) {
    return makeClient(this, ownerId) as never;
  }
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function makeClient(db: FakeDb, ownerId?: string) {
  return {
    from: (table: string) => new Query(db, table, ownerId),
    rpc: async () => ({ data: null, error: { message: "rpc not faked" } }),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        createSignedUrls: async () => ({ data: [], error: null }),
      }),
    },
  };
}

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: ((row: Row) => boolean)[] = [];
  private payload: Row | Row[] | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private db: FakeDb,
    private table: string,
    private ownerId?: string
  ) {}

  select() {
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[key]));
    return this;
  }
  is(key: string, value: unknown) {
    this.filters.push((row) => row[key] === value);
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  returns() {
    return this;
  }
  single() {
    this.mode = "single";
    return this.run();
  }
  maybeSingle() {
    this.mode = "maybe";
    return this.run();
  }
  then<A = { data: unknown; error: { message: string } | null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private visible(row: Row): boolean {
    if (this.ownerId && this.table === "adly_campaigns" && row.user_id !== this.ownerId) return false;
    return this.filters.every((f) => f(row));
  }

  private async run(): Promise<{ data: unknown; error: { message: string } | null }> {
    // Yield once so concurrent callers interleave like real network calls.
    await Promise.resolve();
    const rows = this.db.rows(this.table);
    let out: Row[] = [];
    if (this.op === "select") {
      out = rows.filter((r) => this.visible(r)).map(clone);
    } else if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const item of items) {
        if (this.ownerId && this.table === "adly_campaigns" && item.user_id !== this.ownerId) {
          return { data: null, error: { message: "new row violates row-level security policy" } };
        }
        const now = new Date().toISOString();
        const row = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...clone(item) };
        rows.push(row);
        out.push(clone(row));
      }
      this.db.writes[this.table] = (this.db.writes[this.table] ?? 0) + 1;
    } else if (this.op === "update") {
      for (const row of rows) {
        if (!this.visible(row)) continue;
        Object.assign(row, clone(this.payload));
        out.push(clone(row));
      }
      this.db.writes[this.table] = (this.db.writes[this.table] ?? 0) + 1;
    } else {
      const keep = rows.filter((r) => !this.visible(r));
      out = rows.filter((r) => this.visible(r)).map(clone);
      this.db.tables[this.table] = keep;
      this.db.writes[this.table] = (this.db.writes[this.table] ?? 0) + 1;
    }
    if (this.mode === "single") {
      if (out.length !== 1) return { data: null, error: { message: `expected 1 row, got ${out.length}` } };
      return { data: out[0], error: null };
    }
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}
