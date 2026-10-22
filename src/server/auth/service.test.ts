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

const { currentSession, ensurePoliticianProfile, phase1LeaderId, signIn, signOut, signUp } =
  await import("@/server/auth/service");
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

  it("links the Phase 1 leader profile kept under user-<user id>", async () => {
    const content = getRepositories().content;
    const seed = (await content.listLeaders())[0];
    await content.upsertLeader({ ...seed, id: `user-${USER_ID}`, slug: "otieno-ouma" });
    clients.current = fakeSupabase(trackerDb(), {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    });
    try {
      expect((await currentSession())?.leaderId).toBe(`user-${USER_ID}`);
    } finally {
      await content.deleteLeader(`user-${USER_ID}`);
    }
  });

  it("never treats a bare user id as a leader id", async () => {
    const content = getRepositories().content;
    const seed = (await content.listLeaders())[0];
    // A leader profile stored under the raw uid (as before the fix) is not linked.
    await content.upsertLeader({ ...seed, id: USER_ID, slug: "raw-uid" });
    clients.current = fakeSupabase(trackerDb(), {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    });
    try {
      expect((await currentSession())?.leaderId).toBeUndefined();
    } finally {
      await content.deleteLeader(USER_ID);
    }
  });

  it("is null (and logs) when the account rows cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    clients.current = fakeSupabase(
      { ...trackerDb(), failing: "user_profiles" },
      { getUser: async () => ({ data: { user: authUser }, error: null }) }
    );
    try {
      expect(await currentSession()).toBeNull();
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
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
  it("answers 503 when the account rows cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    clients.current = fakeSupabase(
      { ...trackerDb(), failing: "political_figures" },
      {
        signInWithPassword: async () => ({ data: { user: authUser, session: {} }, error: null }),
      }
    );
    try {
      expect(await signIn("otieno@example.com", "secret-pass")).toMatchObject({
        ok: false,
        status: 503,
      });
    } finally {
      log.mockRestore();
    }
  });

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

describe("signOut", () => {
  it("ends only this browser's session (local scope)", async () => {
    const calls: unknown[] = [];
    clients.current = fakeSupabase(trackerDb(), {
      signOut: async (options) => {
        calls.push(options);
        return { error: null };
      },
    });
    await signOut();
    expect(calls).toEqual([{ scope: "local" }]);
  });
});

describe("leader id collision (a figure row whose id is another user's uid)", () => {
  const VICTIM_ID = USER_ID;
  const ATTACKER_ID = "33333333-3333-4333-8333-333333333333";
  const attacker = {
    ...authUser,
    id: ATTACKER_ID,
    email: "mallory@example.com",
    user_metadata: { full_name: "Mallory", user_type: "political_figure", siasa_role: "leader" },
  };

  function collisionDb(): FakeDb {
    const db = trackerDb();
    db.tables.profiles.push({ id: ATTACKER_ID, name: "Mallory", email: attacker.email, phone: null });
    db.tables.user_profiles.push({ user_id: ATTACKER_ID, user_type: "political_figure", phone: null });
    db.tables.political_figures.push(
      // The attacker's own row, with id set to the victim's auth uid.
      { id: VICTIM_ID, user_id: ATTACKER_ID, status: "active", created_at: "2026-10-03T00:00:00Z" }
    );
    return db;
  }

  it("does not give the attacker the victim's workspace", async () => {
    const content = getRepositories().content;
    const db = collisionDb();

    // The victim (no figure row) opens their politician workspace.
    clients.current = fakeSupabase(db, {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    });
    const victim = await currentSession();
    expect(victim?.leaderId).toBeUndefined();
    const opened = await ensurePoliticianProfile(victim!);
    expect(opened).toMatchObject({ ok: true, leaderId: phase1LeaderId(VICTIM_ID) });
    expect(phase1LeaderId(VICTIM_ID)).toBe(`user-${VICTIM_ID}`);

    try {
      // The attacker's session carries their own figure id (= victim uid) ...
      clients.current = fakeSupabase(db, {
        getUser: async () => ({ data: { user: attacker }, error: null }),
      });
      const mallory = await currentSession();
      expect(mallory?.userId).toBe(ATTACKER_ID);
      expect(mallory?.leaderId).toBe(VICTIM_ID);
      // ... which is not the victim's leader id and holds none of their profile.
      expect(mallory?.leaderId).not.toBe(opened.ok ? opened.leaderId : "");
      expect(await content.findLeader(VICTIM_ID)).toBeUndefined();
      expect((await content.findLeader(phase1LeaderId(VICTIM_ID)))?.name).toBe("Otieno Ouma");

      // The victim still resolves to their own workspace afterwards.
      clients.current = fakeSupabase(db, {
        getUser: async () => ({ data: { user: authUser }, error: null }),
      });
      expect((await currentSession())?.leaderId).toBe(phase1LeaderId(VICTIM_ID));
    } finally {
      await content.deleteLeader(phase1LeaderId(VICTIM_ID));
    }
  });

  it("keeps the oldest of the user's own figure rows when a newer one is added", async () => {
    const db = trackerDb();
    db.tables.political_figures.push(
      { id: "pf-own", user_id: VICTIM_ID, status: "active", created_at: "2026-01-01T00:00:00Z" },
      // Inserted later (e.g. by someone else) with user_id = victim.
      { id: "pf-planted", user_id: VICTIM_ID, status: "aspirant", created_at: "2026-10-01T00:00:00Z" }
    );
    clients.current = fakeSupabase(db, {
      getUser: async () => ({ data: { user: authUser }, error: null }),
    });
    expect(await currentSession()).toMatchObject({ leaderId: "pf-own", role: "leader" });
  });
});
