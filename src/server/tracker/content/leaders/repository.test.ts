import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader } from "@/types";
import {
  createLeaderRepository,
  createLeaderStore,
  LeaderStoreError,
  slugFallback,
  type LeaderActor,
  type LeaderClients,
} from "@/server/tracker/content/leaders/repository";
import type { FigureRow } from "@/server/tracker/content/leaders/mapping";
import { fakeClient, type FakeTables } from "@/server/tracker/content/leaders/fake-figures.test-helper";

vi.mock("@/server/tracker/clients", () => ({
  anonClient: () => {
    throw new Error("inject clients in tests");
  },
  userClient: async () => {
    throw new Error("inject clients in tests");
  },
  serviceClient: () => {
    throw new Error("inject clients in tests");
  },
}));

const OWNER = "9a9a9a9a-0000-4000-8000-0000000000aa";
const OTHER = "9a9a9a9a-0000-4000-8000-0000000000bb";
const ADMIN = "9a9a9a9a-0000-4000-8000-0000000000cc";

function figure(id: string, overrides: Partial<FigureRow> = {}): FigureRow {
  return {
    id,
    user_id: null,
    name: "Leader",
    position: "governor",
    county: "Kiambu",
    constituency: null,
    ward: null,
    term_start: "2022-08-25",
    term_end: "2027-08-25",
    term_years: 5,
    manifesto: { text: "", targets: [], focus_areas: [], uploaded_at: "2025-11-02T10:00:00.000Z" },
    commissioned_projects: [],
    status: "active",
    created_at: "2025-11-02T10:00:00.000Z",
    updated_at: "2025-11-02T10:00:00.000Z",
    ...overrides,
  };
}

const IDS = {
  seeded: "6f1d2c3b-1111-4aaa-8bbb-000000000001",
  twinA: "aaaa1111-2222-4aaa-8bbb-000000000002",
  twinB: "bbbb1111-2222-4aaa-8bbb-000000000003",
  owned: "6f1d2c3b-4444-4aaa-8bbb-000000000004",
  aspirant: "6f1d2c3b-5555-4aaa-8bbb-000000000005",
  former: "6f1d2c3b-6666-4aaa-8bbb-000000000006",
};

let db: FakeTables;
let clients: LeaderClients;
let calls: () => string[];

/** RLS as live: anon sees active; a user also sees and writes their own row. */
function setup(signedIn: string | null) {
  db = {
    calls: [],
    tables: {
      political_figures: [
        figure(IDS.seeded, { name: "Amina Wanjiru" }),
        figure(IDS.twinA, { name: "John Mwangi", position: "mp", created_at: "2025-01-01T00:00:00.000Z" }),
        figure(IDS.twinB, { name: "John Mwangi", position: "senator", created_at: "2025-06-01T00:00:00.000Z" }),
        figure(IDS.owned, { name: "Grace Otieno", user_id: OWNER }),
        figure(IDS.aspirant, { name: "Brian Kip", user_id: OTHER, status: "aspirant", position: "mca" }),
        figure(IDS.former, { name: "Old Timer", status: "former" }),
      ] as unknown as Record<string, unknown>[],
      profiles: [{ id: OWNER, bio: "Bio from profiles" }],
    },
  };
  const anonSees = (table: string, row: Record<string, unknown>) =>
    table !== "political_figures" || row.status === "active";
  clients = {
    anon: () => fakeClient(db, "anon", anonSees),
    user: async () =>
      fakeClient(
        db,
        "user",
        (table, row) => anonSees(table, row) || (signedIn !== null && row.user_id === signedIn),
        signedIn ? { id: signedIn, app_metadata: signedIn === ADMIN ? { role: "admin" } : {} } : null
      ),
    service: () => fakeClient(db, "service"),
  };
  calls = () => db.calls.filter((c) => c.op !== "select" || c.table === "political_figures").map((c) => `${c.client}:${c.op}`);
}

const owner: LeaderActor = { userId: OWNER, isAdmin: false };
const admin: LeaderActor = { userId: ADMIN, isAdmin: true };
const stranger: LeaderActor = { userId: OTHER, isAdmin: false };

beforeEach(() => setup(null));

describe("reads", () => {
  it("lists public rows through anon with collision-aware slugs and no former rows", async () => {
    const store = createLeaderStore({ clients });
    const leaders = await store.list();
    expect(leaders.map((l) => l.slug)).toEqual([
      "amina-wanjiru",
      "grace-otieno",
      "john-mwangi-aaaa1111",
      "john-mwangi-bbbb1111",
    ]);
    expect(db.calls.every((c) => c.client === "anon")).toBe(true);
    expect(leaders.find((l) => l.id === IDS.owned)?.bio).toBe("Bio from profiles");
  });

  it("finds by slug, suffixed slug, bare collided slug and uuid", async () => {
    const store = createLeaderStore({ clients });
    expect((await store.findBySlug("amina-wanjiru"))?.id).toBe(IDS.seeded);
    expect((await store.findBySlug("john-mwangi-bbbb1111"))?.id).toBe(IDS.twinB);
    // Tracker links /p/john-mwangi: first in list order (name, then oldest)
    expect((await store.findBySlug("john-mwangi"))?.id).toBe(IDS.twinA);
    expect((await store.findBySlug(IDS.twinB))?.slug).toBe("john-mwangi-bbbb1111");
    expect(await store.findBySlug("old-timer")).toBeUndefined();
    expect(await store.findBySlug("nobody")).toBeUndefined();
  });

  it("keeps a suffixed link working after the collision is gone", async () => {
    db.tables.political_figures = db.tables.political_figures.filter((row) => row.id !== IDS.twinA);
    const store = createLeaderStore({ clients });
    expect((await store.findBySlug("john-mwangi-bbbb1111"))?.slug).toBe("john-mwangi");
    expect(slugFallback([figure(IDS.twinB, { name: "John Mwangi" })], "john-mwangi-aaaa1111")).toBeUndefined();
  });

  it("passes link targets to the provider and fills missing keys with []", async () => {
    const links = vi.fn(async (targets: Array<{ id: string; userId: string | null }>) => {
      expect(targets.find((t) => t.id === IDS.owned)?.userId).toBe(OWNER);
      return new Map([[IDS.owned, { projectIds: ["prj"], pollIds: ["poll"] }]]);
    });
    const store = createLeaderStore({ clients, links });
    const leader = (await store.list()).find((l) => l.id === IDS.owned)!;
    expect(links).toHaveBeenCalledTimes(1);
    expect(leader.projectIds).toEqual(["prj"]);
    expect(leader.pollIds).toEqual(["poll"]);
    expect(leader.mediaIds).toEqual([]);
  });

  it("findLeader shows a hidden row only to its owner or an admin", async () => {
    setup(OTHER);
    const repo = createLeaderRepository({ clients });
    expect((await repo.findLeader(IDS.aspirant))?.type).toBe("aspirant");
    setup(OWNER);
    expect(await createLeaderRepository({ clients }).findLeader(IDS.aspirant)).toBeUndefined();
    setup(null);
    expect(await createLeaderRepository({ clients }).findLeader(IDS.aspirant)).toBeUndefined();
    expect(await createLeaderStore({ clients }).find(IDS.former, admin)).toBeDefined();
    expect(await createLeaderStore({ clients }).find("ldr-001")).toBeUndefined();
  });
});

async function leaderOf(id: string): Promise<Leader> {
  const found = await createLeaderStore({ clients }).find(id, admin);
  if (!found) throw new Error(`fixture ${id} missing`);
  return found;
}

describe("writes", () => {
  it("owner edits their own row with the user client", async () => {
    setup(OWNER);
    const store = createLeaderStore({ clients });
    const saved = await store.save(owner, { ...(await leaderOf(IDS.owned)), shortBio: "New", position: "Governor, Kisumu" });
    expect(saved.shortBio).toBe("New");
    expect(saved.position).toBe("Governor, Kisumu");
    expect(calls()).toContain("user:update");
    expect(calls()).not.toContain("service:update");
  });

  it("a leader cannot edit someone else's row", async () => {
    setup(OTHER);
    const store = createLeaderStore({ clients });
    await expect(store.save(stranger, await leaderOf(IDS.owned))).rejects.toMatchObject({ status: 403 });
    expect(calls().filter((c) => !c.endsWith(":select"))).toEqual([]);
  });

  it("admin edits another account's row with the service client", async () => {
    const store = createLeaderStore({ clients });
    await store.save(admin, { ...(await leaderOf(IDS.owned)), honorific: "H.E." });
    expect(calls()).toContain("service:update");
  });

  it("a save that only changes derived link arrays writes nothing", async () => {
    setup(OTHER);
    const store = createLeaderStore({ clients, newColumns: false });
    const leader = await leaderOf(IDS.owned);
    // relinkLeaders-style call from another leader's session
    const saved = await store.save(stranger, { ...leader, projectIds: ["x"] });
    expect(saved.projectIds).toEqual([]);
    await expect(store.save(stranger, { ...leader, county: "Nakuru" })).rejects.toBeInstanceOf(LeaderStoreError);
    const asAdmin = await store.save(admin, { ...leader, projectIds: ["x"] });
    expect(asAdmin.projectIds).toEqual([]);
    expect(calls().filter((c) => c.endsWith(":update"))).toEqual([]);
  });

  it("admin creates a leader without an account through the service client", async () => {
    const store = createLeaderStore({ clients, now: () => new Date("2026-10-22T08:00:00Z") });
    const base = await leaderOf(IDS.seeded);
    const created = await store.save(admin, { ...base, id: "ldr-123", name: "New Person", position: "Woman Rep, Meru" });
    const row = db.tables.political_figures.find((r) => r.id === created.id)!;
    expect(row).toMatchObject({
      user_id: null,
      position: "woman_representative",
      office_title: "Woman Rep, Meru",
      term_start: "2026-10-22",
      term_end: "2031-10-22",
    });
    expect(created.slug).toBe("new-person");
    expect(calls()).toContain("service:insert");
  });

  it("rejects a new leader whose office maps to no position", async () => {
    const store = createLeaderStore({ clients });
    const base = await leaderOf(IDS.seeded);
    await expect(store.save(admin, { ...base, id: "x", position: "Elder" })).rejects.toMatchObject({
      status: 400,
      message: "Name the office, e.g. MCA, MP, Governor",
    });
  });

  it("a signed-in leader without a row creates their own with the user client", async () => {
    const NEW_USER = "9a9a9a9a-0000-4000-8000-0000000000dd";
    setup(NEW_USER);
    const store = createLeaderStore({ clients });
    const base = await leaderOf(IDS.seeded);
    const created = await store.save({ userId: NEW_USER, isAdmin: false }, { ...base, id: NEW_USER, name: "Self Made", type: "aspirant", position: "MCA" });
    expect(created.id).toBe(NEW_USER);
    expect(db.tables.political_figures.find((r) => r.id === NEW_USER)).toMatchObject({ user_id: NEW_USER, status: "aspirant", position: "mca" });
    expect(calls()).toContain("user:insert");
    // second create is refused
    await expect(store.save({ userId: NEW_USER, isAdmin: false }, { ...base, id: "ldr-2", position: "MCA" })).rejects.toMatchObject({ status: 409 });
  });

  it("deletes: owner only their own row, admin any row", async () => {
    setup(OTHER);
    const store = createLeaderStore({ clients });
    expect(await store.remove(stranger, IDS.owned)).toBe(false);
    expect(await store.remove(stranger, IDS.aspirant)).toBe(true);
    expect(await store.remove(admin, IDS.seeded)).toBe(true);
    expect(await store.remove(admin, "ldr-001")).toBe(false);
    expect(db.tables.political_figures.map((r) => r.id)).not.toContain(IDS.seeded);
  });

  it("repository writes need a session", async () => {
    const repo = createLeaderRepository({ clients });
    await expect(repo.upsertLeader(await leaderOf(IDS.owned))).rejects.toMatchObject({ status: 401 });
    await expect(repo.deleteLeader(IDS.owned)).rejects.toMatchObject({ status: 401 });
  });

  it("repository resolves the admin from app_metadata", async () => {
    setup(ADMIN);
    const repo = createLeaderRepository({ clients });
    expect(await repo.deleteLeader(IDS.seeded)).toBe(true);
    expect(calls()).toContain("service:delete");
  });
});
