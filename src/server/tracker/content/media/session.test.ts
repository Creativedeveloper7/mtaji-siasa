import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";

vi.mock("@/server/tracker/clients", () => ({
  anonClient: () => {
    throw new Error("not used");
  },
  userClient: async () => {
    throw new Error("not used");
  },
  serviceClient: () => {
    throw new Error("not used");
  },
}));

const { ContentWriteError, resolveOwner } = await import("./session");

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FIG = "33333333-3333-4333-8333-333333333333";
const SEEDED = "44444444-4444-4444-8444-444444444444";

type Figure = { id: string; user_id: string | null; name: string; created_at?: string };

/** Just enough of a PostgREST client for political_figures lookups. */
function fakeClient(label: string, figures: Figure[]): SupabaseClient {
  const query = (filter: (row: Figure) => boolean) => ({
    eq: (column: keyof Figure, value: string) => query((row) => filter(row) && row[column] === value),
    in: (column: keyof Figure, values: string[]) => query((row) => filter(row) && values.includes(row[column] as string)),
    maybeSingle: async () => ({ data: figures.find(filter) ?? null, error: null }),
    then: (resolve: (value: unknown) => void) => resolve({ data: figures.filter(filter), error: null }),
  });
  return {
    label,
    from: () => ({ select: () => query(() => true) }),
  } as unknown as SupabaseClient;
}

const figures: Figure[] = [
  { id: FIG, user_id: OTHER, name: "Hon. Other" },
  { id: SEEDED, user_id: null, name: "Seeded leader" },
  { id: "55555555-5555-4555-8555-555555555555", user_id: ME, name: "Hon. Me" },
];

function setup(isAdmin: boolean) {
  const own = fakeClient("user", figures);
  const service = fakeClient("service", figures);
  const caller = {
    client: own,
    user: { id: ME, app_metadata: isAdmin ? { role: "admin" } : {}, user_metadata: { full_name: "Me Person" } } as unknown as User,
    isAdmin,
  };
  const clients = { anon: () => own, user: async () => own, service: () => service };
  return { caller, clients, own, service };
}

const labelOf = (client: SupabaseClient) => (client as unknown as { label: string }).label;

describe("resolveOwner", () => {
  it("inserts as the caller with their session when no leader is named", async () => {
    const { caller, clients } = setup(false);
    const target = await resolveOwner(caller, clients, null, undefined);
    expect(target.ownerId).toBe(ME);
    expect(labelOf(target.client)).toBe("user");
    expect(target.ownerName).toBe("Hon. Me");
  });
  it("accepts the caller's own user id as leaderId (Phase 1 sessions without a figure)", async () => {
    const { caller, clients } = setup(false);
    expect((await resolveOwner(caller, clients, null, ME)).ownerId).toBe(ME);
  });
  it("accepts the caller's Phase 1 leader id user-<uid>, but not another user's", async () => {
    const { caller, clients } = setup(false);
    const target = await resolveOwner(caller, clients, null, `user-${ME}`);
    expect(target.ownerId).toBe(ME);
    expect(labelOf(target.client)).toBe("user");
    await expect(resolveOwner(caller, clients, null, `user-${OTHER}`)).rejects.toMatchObject({ status: 400 });
  });
  it("refuses a non-admin writing for another leader", async () => {
    const { caller, clients } = setup(false);
    await expect(resolveOwner(caller, clients, null, FIG)).rejects.toMatchObject({ status: 403 });
    await expect(resolveOwner(caller, clients, { ownerId: OTHER }, undefined)).rejects.toBeInstanceOf(ContentWriteError);
  });
  it("lets an admin write for another leader with the service client", async () => {
    const { caller, clients } = setup(true);
    const target = await resolveOwner(caller, clients, null, FIG);
    expect(target).toMatchObject({ ownerId: OTHER, ownerName: "Hon. Other" });
    expect(labelOf(target.client)).toBe("service");
  });
  it("keeps the existing owner on update", async () => {
    const { caller, clients } = setup(true);
    const target = await resolveOwner(caller, clients, { ownerId: ME }, FIG);
    expect(target.ownerId).toBe(ME);
    expect(labelOf(target.client)).toBe("user");
  });
  it("rejects leaders without an account and unknown leaders", async () => {
    const { caller, clients } = setup(true);
    await expect(resolveOwner(caller, clients, null, SEEDED)).rejects.toMatchObject({ status: 400 });
    await expect(resolveOwner(caller, clients, null, "66666666-6666-4666-8666-666666666666")).rejects.toMatchObject({ status: 400 });
    await expect(resolveOwner(caller, clients, null, "led-001")).rejects.toMatchObject({ status: 400 });
  });
  it("leaves ownerless rows to admins", async () => {
    await expect(resolveOwner(setup(false).caller, setup(false).clients, { ownerId: null }, undefined)).rejects.toMatchObject({ status: 403 });
    const { caller, clients } = setup(true);
    expect(labelOf((await resolveOwner(caller, clients, { ownerId: null }, undefined)).client)).toBe("service");
  });
});
