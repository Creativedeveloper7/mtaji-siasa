import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase, type FakeDb } from "@/test/fake-supabase";

const clients = vi.hoisted(() => ({ current: null as SupabaseClient | null }));

vi.mock("@/server/tracker/clients", () => ({
  TrackerConfigError: class extends Error {},
  hasServiceRole: () => false,
  userClient: async () => clients.current,
  anonClient: () => clients.current,
  serviceClient: () => {
    throw new Error("service role not used in these tests");
  },
}));

const { currentSession, signIn, signUp } = await import("@/server/auth/service");
const { getRepositories } = await import("@/server");

const USER_ID = "22222222-2222-4222-8222-222222222222";
const authUser = {
  id: USER_ID,
  email: "otieno@example.com",
  created_at: "2026-10-02T09:00:00.000Z",
  app_metadata: {},
  user_metadata: { full_name: "Otieno O", user_type: "political_figure", siasa_role: "leader" },
  identities: [{ id: "identity" }],
};

function trackerDb(): FakeDb {
  return {
    updates: [],
    tables: {
      profiles: [{ id: USER_ID, name: "Otieno Ouma", email: authUser.email, phone: "+254722000002" }],
      user_profiles: [{ user_id: USER_ID, user_type: "political_figure", phone: null }],
      political_figures: [],
    },
  };
}

const env = { ...process.env };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.MTAJI_STORE;
});
afterAll(() => {
  process.env = env;
});
beforeEach(() => {
  clients.current = null;
});

describe("currentSession", () => {
  it("builds the session from the verified Supabase user", async () => {
    clients.current = fakeSupabase(trackerDb(), {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    });
    expect(await currentSession()).toEqual({
      userId: USER_ID,
      email: "otieno@example.com",
      fullName: "Otieno Ouma",
      role: "leader",
      leaderId: undefined,
    });
  });

  it("is null when Supabase rejects the session cookie", async () => {
    clients.current = fakeSupabase(trackerDb(), {
      getUser: async () => ({ data: { user: null }, error: { message: "invalid JWT" } }),
    });
    expect(await currentSession()).toBeNull();
  });

  it("links the Phase 1 leader profile kept under the user id", async () => {
    const content = getRepositories().content;
    const seed = (await content.listLeaders())[0];
    await content.upsertLeader({ ...seed, id: USER_ID, slug: "otieno-ouma" });
    clients.current = fakeSupabase(trackerDb(), {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    });
    expect((await currentSession())?.leaderId).toBe(USER_ID);
    await content.deleteLeader(USER_ID);
  });

  it("is null in memory mode without asking Supabase", async () => {
    process.env.MTAJI_STORE = "memory";
    try {
      expect(await currentSession()).toBeNull();
    } finally {
      delete process.env.MTAJI_STORE;
    }
  });
});

describe("signUp", () => {
  const input = {
    fullName: " Otieno Ouma ",
    email: "Otieno@Example.com",
    phone: "+254722000002",
    password: "secret-pass",
    role: "aspirant",
  };

  it("asks for email confirmation when Supabase returns no session", async () => {
    let sent: unknown;
    const db = trackerDb();
    clients.current = fakeSupabase(db, {
      signUp: async (request) => {
        sent = request;
        return { data: { user: authUser, session: null }, error: null };
      },
    });
    const result = await signUp(input, "https://siasa.example");
    expect(result).toEqual({ ok: true, needsConfirmation: true });
    expect(sent).toEqual({
      email: "otieno@example.com",
      password: "secret-pass",
      options: {
        data: {
          full_name: "Otieno Ouma",
          phone: "+254722000002",
          user_type: "political_figure",
          siasa_role: "aspirant",
        },
        emailRedirectTo: "https://siasa.example/auth/callback",
      },
    });
    // No session yet, so nothing is written as the user.
    expect(db.updates).toEqual([]);
  });

  it("signs in straight away and stores the phone when a session comes back", async () => {
    const db = trackerDb();
    const signedUp = { ...authUser, user_metadata: { ...authUser.user_metadata, siasa_role: "aspirant" } };
    clients.current = fakeSupabase(db, {
      signUp: async () => ({ data: { user: signedUp, session: { access_token: "t" } }, error: null }),
    });
    const result = await signUp(input, "https://siasa.example");
    expect(result).toEqual({
      ok: true,
      session: {
        userId: USER_ID,
        email: "otieno@example.com",
        fullName: "Otieno Ouma",
        role: "aspirant",
        leaderId: undefined,
      },
    });
    expect(db.updates).toEqual([
      { table: "profiles", values: { phone: "+254722000002" }, filters: { id: USER_ID } },
    ]);
  });

  it("reports an existing email (Supabase returns a user with no identities)", async () => {
    clients.current = fakeSupabase(trackerDb(), {
      signUp: async () => ({ data: { user: { ...authUser, identities: [] }, session: null }, error: null }),
    });
    expect(await signUp(input, "https://siasa.example")).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects a short password before calling Supabase", async () => {
    expect(await signUp({ ...input, password: "123" }, "https://siasa.example")).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("signIn", () => {
  it("explains an unconfirmed email", async () => {
    clients.current = fakeSupabase(trackerDb(), {
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { code: "email_not_confirmed", message: "Email not confirmed" },
      }),
    });
    expect(await signIn("otieno@example.com", "secret-pass")).toMatchObject({ ok: false, status: 403 });
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    clients.current = fakeSupabase(trackerDb(), {
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { code: "invalid_credentials", message: "Invalid login credentials" },
      }),
    });
    expect(await signIn("otieno@example.com", "wrong")).toEqual({
      ok: false,
      error: "Invalid email or password.",
      status: 401,
    });
  });
});
