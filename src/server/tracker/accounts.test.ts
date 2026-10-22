import { describe, expect, it } from "vitest";
import { loadAccountRows, toAccount, toSession, type AuthUser } from "@/server/tracker/accounts";
import { fakeSupabase, type FakeDb } from "@/test/fake-supabase";

const user: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "amina@example.com",
  created_at: "2026-10-01T08:00:00.000Z",
  app_metadata: {},
  user_metadata: { full_name: "Amina M", phone: "+254711000001", user_type: "political_figure" },
};

function db(overrides: Partial<FakeDb["tables"]> = {}): FakeDb {
  return {
    updates: [],
    tables: {
      profiles: [{ id: user.id, name: "Amina Mohamed", email: user.email, phone: null }],
      user_profiles: [{ user_id: user.id, user_type: "political_figure", phone: null }],
      political_figures: [
        { id: "pf-old", user_id: user.id, status: "former", created_at: "2025-01-01" },
        { id: "pf-new", user_id: user.id, status: "aspirant", created_at: "2026-01-01" },
        { id: "pf-other", user_id: "someone-else", status: "active", created_at: "2026-05-01" },
      ],
      ...overrides,
    },
  };
}

describe("session building from Tracker rows", () => {
  it("uses the oldest of the user's own political_figures rows for role and leaderId", async () => {
    const rows = await loadAccountRows(fakeSupabase(db()), user);
    expect(toSession(toAccount(rows))).toEqual({
      userId: user.id,
      email: "amina@example.com",
      fullName: "Amina Mohamed",
      role: "leader",
      leaderId: "pf-old",
    });
  });

  it("breaks a created_at tie by id", async () => {
    const rows = await loadAccountRows(
      fakeSupabase(
        db({
          political_figures: [
            { id: "pf-b", user_id: user.id, status: "active", created_at: "2026-01-01" },
            { id: "pf-a", user_id: user.id, status: "aspirant", created_at: "2026-01-01" },
          ],
        })
      ),
      user
    );
    expect(toAccount(rows)).toMatchObject({ leaderId: "pf-a", role: "aspirant" });
  });

  it("ignores a figure row that belongs to someone else", () => {
    const account = toAccount({
      user,
      figure: { id: "pf-other", user_id: "someone-else", status: "aspirant" },
    });
    expect(account.leaderId).toBeUndefined();
    expect(account.role).toBe("leader");
  });

  it("falls back to user_metadata when profile fields are empty", async () => {
    const rows = await loadAccountRows(
      fakeSupabase(db({ profiles: [], political_figures: [] })),
      user
    );
    const account = toAccount(rows);
    expect(account.fullName).toBe("Amina M");
    expect(account.phone).toBe("+254711000001");
    expect(account.role).toBe("leader");
    expect(account.leaderId).toBeUndefined();
  });

  it("uses user_metadata.user_type when the user_profiles row is missing", async () => {
    const citizen: AuthUser = { ...user, user_metadata: { user_type: "individual" } };
    const rows = await loadAccountRows(
      fakeSupabase(db({ user_profiles: [], political_figures: [] })),
      citizen
    );
    expect(toAccount(rows).role).toBe("citizen");
  });

  it("grants admin from app_metadata and ignores profiles.role", async () => {
    const admin: AuthUser = { ...user, app_metadata: { role: "admin" } };
    const rows = await loadAccountRows(fakeSupabase(db()), admin);
    expect(toAccount(rows).role).toBe("admin");

    const rowsWithForgedRole = await loadAccountRows(
      fakeSupabase(
        db({ profiles: [{ id: user.id, name: "Amina", email: user.email, phone: null, role: "admin" }] })
      ),
      user
    );
    expect(toAccount(rowsWithForgedRole).role).toBe("leader");
  });

  it("fails loudly when a profile table cannot be read", async () => {
    await expect(
      loadAccountRows(fakeSupabase({ ...db(), failing: "user_profiles" }), user)
    ).rejects.toThrow("user_profiles is unavailable");
  });
});
