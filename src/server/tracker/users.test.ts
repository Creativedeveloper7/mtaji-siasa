import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase, type FakeDb } from "@/test/fake-supabase";

const clients = vi.hoisted(() => ({ admin: null as SupabaseClient | null }));

vi.mock("@/server/tracker/clients", () => ({
  TrackerConfigError: class extends Error {},
  hasServiceRole: () => true,
  userClient: async () => clients.admin,
  anonClient: () => clients.admin,
  serviceClient: () => clients.admin,
}));

const { createTrackerUserRepository } = await import("@/server/tracker/users");
const { adminUpsertUser, listDirectory } = await import("@/server/auth/service");

type FakeUser = {
  id: string;
  email: string;
  created_at: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

const AMINA = "11111111-1111-4111-8111-111111111111";
const OTIENO = "22222222-2222-4222-8222-222222222222";

let authUsers: FakeUser[];
let db: FakeDb;
let adminUpdates: Array<{ id: string; attrs: Record<string, unknown> }>;

function adminApi() {
  return {
    listUsers: async ({ page, perPage }: { page: number; perPage: number }) => ({
      data: { users: authUsers.slice((page - 1) * perPage, page * perPage) },
      error: null,
    }),
    getUserById: async (id: string) => {
      const user = authUsers.find((u) => u.id === id);
      return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "not found" } };
    },
    updateUserById: async (id: string, attrs: Record<string, unknown>) => {
      adminUpdates.push({ id, attrs });
      const user = authUsers.find((u) => u.id === id)!;
      if (attrs.user_metadata) user.user_metadata = attrs.user_metadata as Record<string, unknown>;
      if (attrs.app_metadata) user.app_metadata = attrs.app_metadata as Record<string, unknown>;
      if (typeof attrs.email === "string") user.email = attrs.email;
      return { data: { user }, error: null };
    },
  };
}

beforeEach(() => {
  authUsers = [
    {
      id: AMINA,
      email: "amina@example.com",
      created_at: "2026-10-01T08:00:00.000Z",
      app_metadata: { provider: "email" },
      user_metadata: { full_name: "Amina M", user_type: "individual", siasa_role: "citizen" },
    },
    {
      id: OTIENO,
      email: "otieno@example.com",
      created_at: "2026-10-02T08:00:00.000Z",
      app_metadata: { provider: "email" },
      user_metadata: { full_name: "Otieno O", user_type: "political_figure", siasa_role: "aspirant" },
    },
  ];
  adminUpdates = [];
  db = {
    updates: [],
    reads: [],
    tables: {
      profiles: [
        { id: AMINA, name: "Amina Mohamed", email: "Amina@Example.com", phone: "+254711000001" },
        { id: OTIENO, name: "Otieno Ouma", email: "otieno@example.com", phone: "+254722000002" },
        { id: "not-listed", name: "Stray", email: "amina_x@example.com", phone: null },
      ],
      user_profiles: [
        { user_id: AMINA, user_type: "individual", phone: null },
        { user_id: OTIENO, user_type: "political_figure", phone: null },
      ],
      political_figures: [
        { id: "pf-newer", user_id: OTIENO, status: "active", created_at: "2026-09-01" },
        { id: "pf-oldest", user_id: OTIENO, status: "aspirant", created_at: "2026-01-01" },
      ],
    },
  };
  clients.admin = fakeSupabase(db, { admin: adminApi() as never });
});

const env = { ...process.env };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.MTAJI_STORE;
});
afterAll(() => {
  process.env = env;
});

describe("tracker user repository: admin grant and revoke", () => {
  it("grants admin in app_metadata and keeps the account type", async () => {
    const users = createTrackerUserRepository();
    const amina = (await users.findById(AMINA))!;
    const updated = await users.update({ ...amina, role: "admin" });

    expect(updated?.role).toBe("admin");
    expect(authUsers[0].app_metadata).toEqual({ provider: "email", role: "admin" });
    expect(authUsers[0].user_metadata).toMatchObject({ user_type: "individual", siasa_role: "citizen" });
    // No user_profiles write: admin is a grant on top of the type.
    expect(db.updates.filter((u) => u.table === "user_profiles")).toEqual([]);
  });

  it("revokes admin by clearing app_metadata.role and setting the type", async () => {
    authUsers[0].app_metadata = { provider: "email", role: "admin" };
    const users = createTrackerUserRepository();
    const amina = (await users.findById(AMINA))!;
    expect(amina.role).toBe("admin");

    const updated = await users.update({ ...amina, role: "organization" });

    expect(updated?.role).toBe("organization");
    expect(authUsers[0].app_metadata).toEqual({ provider: "email", role: null });
    expect(authUsers[0].user_metadata).toMatchObject({
      user_type: "organization",
      siasa_role: "organization",
    });
    expect(db.tables.user_profiles[0]).toMatchObject({ user_id: AMINA, user_type: "organization" });
  });
});

describe("tracker user repository: directory and lookup", () => {
  it("narrows profile reads to the listed users and picks the oldest figure row", async () => {
    const users = createTrackerUserRepository();
    const list = await users.listPublic();

    expect(list.map((u) => [u.id, u.role, u.leaderId])).toEqual([
      [AMINA, "citizen", undefined],
      [OTIENO, "aspirant", "pf-oldest"],
    ]);
    const tableReads = db.reads!.filter((r) =>
      ["profiles", "user_profiles", "political_figures"].includes(r.table)
    );
    expect(tableReads).toHaveLength(3);
    for (const read of tableReads) {
      expect(Object.values(read.filters)).toEqual([{ in: [AMINA, OTIENO] }]);
    }
  });

  it("finds an email case-insensitively but never by wildcard", async () => {
    const users = createTrackerUserRepository();
    expect((await users.findByEmail("AMINA@example.com"))?.id).toBe(AMINA);
    // "_" and "%" are LIKE wildcards; unescaped, both of these would find Amina.
    expect(await users.findByEmail("amina@exampl_.com")).toBeUndefined();
    expect(await users.findByEmail("%@example.com")).toBeUndefined();
  });
});

describe("adminUpsertUser role that does not stick", () => {
  it("answers 409 when the figure status keeps the account an aspirant", async () => {
    const result = await adminUpsertUser({
      id: OTIENO,
      fullName: "Otieno Ouma",
      email: "otieno@example.com",
      phone: "+254722000002",
      role: "leader",
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(!result.ok && result.error).toMatch(/political figure status decides leader vs aspirant/);
    // The write did go through; only the role is decided elsewhere.
    expect(authUsers[1].user_metadata).toMatchObject({ siasa_role: "leader" });
  });

  it("succeeds when the requested role takes effect", async () => {
    const result = await adminUpsertUser({
      id: AMINA,
      fullName: "Amina Mohamed",
      email: "amina@example.com",
      phone: "+254711000001",
      role: "admin",
    });
    expect(result).toMatchObject({ ok: true, session: { userId: AMINA, role: "admin" } });
    expect(adminUpdates.map((u) => (u.attrs.app_metadata as Record<string, unknown>).role)).toEqual([
      "admin",
    ]);
  });
});

describe("admin directory errors", () => {
  const newUser = {
    fullName: "Wanjiru K",
    email: "wanjiru@example.com",
    phone: "+254733000003",
    password: "secret-pass",
    role: "citizen",
  };

  it("answers 409 only for a duplicate email, with a message for people", async () => {
    clients.admin = fakeSupabase(db, {
      admin: {
        ...adminApi(),
        createUser: async () => ({
          data: { user: null },
          error: { message: "A user with this email address has already been registered", code: "email_exists", status: 422 },
        }),
      } as never,
    });
    expect(await adminUpsertUser(newUser)).toEqual({
      ok: false,
      status: 409,
      error: "An account with this email already exists.",
    });
  });

  it("answers 400 with a message for people for a weak password or an invalid email", async () => {
    const answers = [
      [{ message: "Password should be at least 8 characters.", code: "weak_password", status: 422 }, "Password should be at least 8 characters."],
      [{ message: "Password should contain at least one character of each: abc", status: 422 }, "Password should contain at least one character of each: abc"],
      [{ message: "weak", code: "weak_password", status: 422 }, "Choose a stronger password."],
      [{ message: "Unable to validate email address: invalid format", code: "email_address_invalid", status: 400 }, "Enter a valid email address."],
      [{ message: "Unable to validate email address: invalid format", status: 400 }, "Enter a valid email address."],
    ] as const;
    for (const [error, message] of answers) {
      clients.admin = fakeSupabase(db, {
        admin: {
          ...adminApi(),
          createUser: async () => ({ data: { user: null }, error }),
        } as never,
      });
      expect(await adminUpsertUser(newUser)).toEqual({ ok: false, status: 400, error: message });
    }
  });

  it("hides Auth and database text behind a generic 502, not a 409", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    clients.admin = fakeSupabase(db, {
      admin: {
        ...adminApi(),
        createUser: async () => ({
          data: { user: null },
          error: { message: 'Database error saving new user: relation "user_profiles" violates check', status: 500 },
        }),
        listUsers: async () => ({ data: { users: [] }, error: { message: "permission denied for schema auth" } }),
      } as never,
    });
    try {
      const created = await adminUpsertUser(newUser);
      expect(created).toMatchObject({ ok: false, status: 502 });
      expect(!created.ok && created.error).not.toMatch(/Database|relation|violates|user_profiles/);
      const listed = await listDirectory();
      expect(listed).toMatchObject({ ok: false, status: 502 });
      expect(!listed.ok && listed.error).not.toMatch(/permission|schema|auth/);
    } finally {
      log.mockRestore();
    }
  });
});
