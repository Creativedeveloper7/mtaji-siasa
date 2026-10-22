import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/types";
import { fakeClient, type FakeCall, type FakeTables } from "@/server/tracker/content/leaders/fake-figures.test-helper";

// Clients are swapped per test: `env.user` is the signed-in session (RLS), `env.service` bypasses RLS.
const env = vi.hoisted(() => ({
  anon: (): unknown => {
    throw new Error("anon not set");
  },
  user: (): unknown => {
    throw new Error("user not set");
  },
  service: (): unknown => {
    throw new Error("service not set");
  },
}));

vi.mock("@/server/tracker/clients", () => ({
  TrackerConfigError: class TrackerConfigError extends Error {},
  anonClient: () => env.anon(),
  userClient: async () => env.user(),
  serviceClient: () => env.service(),
}));

import { createProjectRepository, ProjectAccessError, ProjectConflictError } from "./repository";

type Row = Record<string, unknown>;

const OWNER = "0a000000-0000-4000-8000-0000000000a1";
const OTHER = "0a000000-0000-4000-8000-0000000000b2";
const COLEAD = "0a000000-0000-4000-8000-0000000000c3";
const ADMIN = "0a000000-0000-4000-8000-0000000000d4";
const NEWBIE = "0a000000-0000-4000-8000-0000000000e5";

const P = "11111111-2222-4333-8444-555555555555";
const DRAFT = "11111111-2222-4333-8444-666666666666";
const CM_OWNER = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const CM_OTHER = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";

const F_OWNER = "f0000000-0000-4000-8000-000000000001";
const F_OTHER = "f0000000-0000-4000-8000-000000000002";
const F_COLEAD = "f0000000-0000-4000-8000-000000000003";
const F_SEED = "f0000000-0000-4000-8000-000000000004";

const T0 = "2026-08-26T03:00:00.000000+00:00";
const PUBLIC = new Set(["published", "active", "completed"]);

/** Columns of the live initiatives table before §17 M4 (no start_date, progress_percent). */
const LIVE_INITIATIVE_COLUMNS = [
  "id", "changemaker_id", "title", "short_description", "description", "category", "target_amount",
  "raised_amount", "location", "project_duration", "expected_completion", "reference_images",
  "payment_details", "status", "created_at", "updated_at", "satellite_snapshots", "opportunity_preferences",
];

let db: FakeTables;

function figure(id: string, userId: string | null, commissioned: string[] = []): Row {
  return { id, user_id: userId, name: `Figure ${id.slice(-1)}`, status: "active", commissioned_projects: commissioned };
}

function initiative(id: string, changemakerId: string, overrides: Row = {}): Row {
  return {
    id,
    changemaker_id: changemakerId,
    title: "Kibera Water Kiosk",
    short_description: "Upgrade a kiosk.",
    description: "Upgrade a kiosk.",
    category: "water",
    target_amount: 0,
    raised_amount: 0,
    location: { county: "Nairobi", specific_area: "Olympic", coordinates: { lat: -1.313, lng: 36.789 } },
    expected_completion: "2026-12-31",
    reference_images: [],
    status: "published",
    created_at: "2026-08-26T03:00:00.000Z",
    updated_at: T0,
    satellite_snapshots: [{ date: "2026-08-26", imageUrl: "https://example.test/sat.jpg" }],
    ...overrides,
  };
}

function owns(uid: string, row: Row): boolean {
  return (db.tables.changemakers ?? []).some((cm) => cm.id === row.changemaker_id && cm.user_id === uid);
}

/** RLS as live, for the signed-in user `uid`. */
function rls(uid: string) {
  return (table: string, row: Row, op: FakeCall["op"]): boolean => {
    if (table === "initiatives") return op === "select" ? PUBLIC.has(String(row.status)) || owns(uid, row) : owns(uid, row);
    if (table === "changemakers") return op === "select" || row.user_id === uid;
    if (table === "political_figures") {
      return op === "select" ? row.status === "active" || row.user_id === uid : row.user_id === uid;
    }
    return true;
  };
}

function signIn(uid: string, admin = false) {
  const user = { id: uid, app_metadata: admin ? { role: "admin" } : {}, user_metadata: { full_name: "New Person" } };
  env.user = () => fakeClient(db, "user", rls(uid), user);
  env.service = () => fakeClient(db, "service");
  env.anon = () => fakeClient(db, "anon", rls("anon"));
}

beforeEach(() => {
  db = {
    calls: [],
    tables: {
      changemakers: [
        { id: CM_OWNER, user_id: OWNER, name: "Owner", created_at: "2026-01-01T00:00:00Z" },
        { id: CM_OTHER, user_id: OTHER, name: "Other", created_at: "2026-01-01T00:00:00Z" },
      ],
      initiatives: [initiative(P, CM_OWNER), initiative(DRAFT, CM_OTHER, { status: "draft", title: "Secret" })],
      political_figures: [
        figure(F_OWNER, OWNER),
        figure(F_OTHER, OTHER),
        figure(F_COLEAD, COLEAD, [P]),
        figure(F_SEED, null),
      ],
      milestones: [],
      opportunities: [],
      blogs: [],
    },
  };
});

function writes(table?: string) {
  return db.calls
    .filter((c) => c.op !== "select" && (!table || c.table === table))
    .map((c) => `${c.client}:${c.op}:${c.table}`);
}

function figureRow(id: string): Row {
  return db.tables.political_figures.find((r) => r.id === id)!;
}

async function loadP(): Promise<Project> {
  const found = await createProjectRepository().findProject(P);
  if (!found) throw new Error("fixture P missing");
  db.calls = [];
  return found;
}

describe("client choice (clientFor / readerFor)", () => {
  it("the owner writes with their own session", async () => {
    signIn(OWNER);
    const project = await loadP();
    expect(project.leaderIds.sort()).toEqual([F_COLEAD, F_OWNER].sort());
    await createProjectRepository().upsertProject({ ...project, name: "Renamed" });
    expect(writes()).toEqual(["user:update:initiatives"]);
    expect(db.tables.initiatives[0].title).toBe("Renamed");
  });

  it("an admin edits someone else's project through the service client and reads with it", async () => {
    signIn(ADMIN, true);
    const project = await loadP();
    await createProjectRepository().upsertProject({ ...project, name: "By admin" });
    expect(writes()).toEqual(["service:update:initiatives"]);
    expect(db.calls.some((c) => c.client === "service" && c.op === "select" && c.table === "initiatives")).toBe(true);
  });

  it("a stranger's edit is refused (RLS matches nothing) and nothing changes", async () => {
    signIn(OTHER);
    const project = await loadP();
    await expect(createProjectRepository().upsertProject({ ...project, name: "Hijack" })).rejects.toBeInstanceOf(
      ProjectAccessError
    );
    expect(db.tables.initiatives[0].title).toBe("Kibera Water Kiosk");
  });
});

describe("co-leaders (finding 1)", () => {
  it("a non-admin cannot attach their own figure to someone else's project, even with no other change", async () => {
    signIn(OTHER);
    const project = await loadP();
    const error = await createProjectRepository()
      .upsertProject({ ...project, leaderIds: [...project.leaderIds, F_OTHER] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProjectAccessError);
    expect((error as ProjectAccessError).status).toBe(403);
    expect(figureRow(F_OTHER).commissioned_projects).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("the owner cannot attach another leader either (admin-only), and the project is not half-saved", async () => {
    signIn(OWNER);
    const project = await loadP();
    await expect(
      createProjectRepository().upsertProject({ ...project, name: "Changed", leaderIds: [...project.leaderIds, F_SEED] })
    ).rejects.toBeInstanceOf(ProjectAccessError);
    expect(db.tables.initiatives[0].title).toBe("Kibera Water Kiosk");
    expect(figureRow(F_SEED).commissioned_projects).toEqual([]);
  });

  it("a co-leader can remove themself with their own session", async () => {
    signIn(COLEAD);
    const project = await loadP();
    const saved = await createProjectRepository().upsertProject({
      ...project,
      leaderIds: project.leaderIds.filter((id) => id !== F_COLEAD),
    });
    expect(figureRow(F_COLEAD).commissioned_projects).toEqual([]);
    expect(writes()).toEqual(["user:update:political_figures"]);
    expect(saved.leaderIds).toEqual([F_OWNER]);
  });

  it("the owner cannot remove another co-leader (403, not silently skipped)", async () => {
    signIn(OWNER);
    const project = await loadP();
    await expect(
      createProjectRepository().upsertProject({ ...project, leaderIds: [F_OWNER] })
    ).rejects.toBeInstanceOf(ProjectAccessError);
    expect(figureRow(F_COLEAD).commissioned_projects).toEqual([P]);
  });

  it("an admin links and unlinks anyone through the service client", async () => {
    signIn(ADMIN, true);
    const project = await loadP();
    const saved = await createProjectRepository().upsertProject({ ...project, leaderIds: [F_OWNER, F_SEED] });
    expect(figureRow(F_SEED).commissioned_projects).toEqual([P]);
    expect(figureRow(F_COLEAD).commissioned_projects).toEqual([]);
    expect(writes().sort()).toEqual(["service:update:political_figures", "service:update:political_figures"]);
    expect(saved.leaderIds.sort()).toEqual([F_OWNER, F_SEED].sort());
  });

  it("a non-admin creating a project with another leader is refused before anything is inserted", async () => {
    signIn(OWNER);
    const project = await loadP();
    await expect(
      createProjectRepository().upsertProject({ ...project, id: "new-1", leaderIds: [F_OWNER, F_OTHER] })
    ).rejects.toBeInstanceOf(ProjectAccessError);
    expect(writes()).toEqual([]);
  });

  it("deleting a project drops only the links the caller may write", async () => {
    signIn(OWNER);
    expect(await createProjectRepository().deleteProject(P)).toBe(true);
    expect(db.tables.initiatives.map((r) => r.id)).toEqual([DRAFT]);
    expect(figureRow(F_COLEAD).commissioned_projects).toEqual([P]); // not the owner's row to change
  });
});

describe("creates: changemakers and migration-adaptive insert (finding 5)", () => {
  it("reuses the owner's changemakers row", async () => {
    signIn(OWNER);
    const project = await loadP();
    const created = await createProjectRepository({ onWarning: () => {} }).upsertProject({
      ...project,
      id: "new-1",
      name: "Second project",
      leaderIds: [F_OWNER],
    });
    expect(writes()).toEqual(["user:insert:initiatives"]);
    expect(db.tables.initiatives.find((r) => r.id === created.id)?.changemaker_id).toBe(CM_OWNER);
    expect(created.leaderIds).toEqual([F_OWNER]);
  });

  it("creates a changemakers row for a user who has none", async () => {
    signIn(NEWBIE);
    const project = await loadP();
    const created = await createProjectRepository({ onWarning: () => {} }).upsertProject({
      ...project,
      id: "new-2",
      name: "First project",
      leaderIds: [],
    });
    expect(writes()).toEqual(["user:insert:changemakers", "user:insert:initiatives"]);
    const cm = db.tables.changemakers.find((r) => r.user_id === NEWBIE)!;
    expect(cm).toMatchObject({ name: "New Person" });
    expect(cm).not.toHaveProperty("email");
    expect(db.tables.initiatives.find((r) => r.id === created.id)?.changemaker_id).toBe(cm.id);
  });

  it("before §17 M4: retries without start_date / progress_percent and reports the lost fields", async () => {
    signIn(OWNER);
    db.columns = { initiatives: LIVE_INITIATIVE_COLUMNS };
    const project = await loadP();
    const warnings: string[] = [];
    const created = await createProjectRepository({ onWarning: (m) => warnings.push(m) }).upsertProject({
      ...project,
      id: "new-3",
      name: "Adaptive",
      startDate: "2026-09-01",
      progress: 40,
      leaderIds: [F_OWNER],
    });
    const inserts = db.calls.filter((c) => c.op === "insert" && c.table === "initiatives");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toHaveProperty("start_date");
    expect(inserts[1].values).not.toHaveProperty("start_date");
    expect(inserts[1].values).not.toHaveProperty("progress_percent");
    expect(db.tables.initiatives.find((r) => r.id === created.id)?.title).toBe("Adaptive");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/start_date, progress_percent/);
  });

  it("does not retry when the failing column is not a NEW one", async () => {
    signIn(OWNER);
    db.columns = { initiatives: LIVE_INITIATIVE_COLUMNS.filter((c) => c !== "short_description") };
    const project = await loadP();
    await expect(
      createProjectRepository({ onWarning: () => {} }).upsertProject({ ...project, id: "new-4", leaderIds: [F_OWNER] })
    ).rejects.toThrow(/short_description/);
    expect(db.calls.filter((c) => c.op === "insert" && c.table === "initiatives")).toHaveLength(1);
  });

  it("inserting with the id of a hidden row is a 409, not a 500 (finding 7d)", async () => {
    signIn(OWNER);
    const project = await loadP();
    const error = await createProjectRepository()
      .upsertProject({ ...project, id: DRAFT, name: "Clash", leaderIds: [F_OWNER] })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProjectConflictError);
    expect((error as ProjectConflictError).status).toBe(409);
    expect(db.tables.initiatives.find((r) => r.id === DRAFT)?.title).toBe("Secret");
  });
});

describe("optimistic concurrency (finding 6)", () => {
  it("updates require the updated_at that was read", async () => {
    signIn(OWNER);
    const project = await loadP();
    await createProjectRepository().upsertProject({ ...project, name: "Renamed" });
    const update = db.calls.find((c) => c.op === "update")!;
    expect(update.filters).toContainEqual(["updated_at", "eq", T0]);
  });

  it("409 when the project changed elsewhere in between", async () => {
    signIn(OWNER);
    const project = await loadP();
    db.beforeWrite = (call) => {
      if (call.op === "update" && call.table === "initiatives") db.tables.initiatives[0].updated_at = "2026-10-22T10:00:00+00:00";
    };
    await expect(createProjectRepository().upsertProject({ ...project, name: "Mine" })).rejects.toBeInstanceOf(
      ProjectConflictError
    );
  });
});

describe("findProjectBySlug (finding 7c)", () => {
  beforeEach(() => {
    db.tables.initiatives.push(
      initiative("22222222-2222-4333-8444-000000000001", CM_OWNER, { title: "Twin Road", created_at: "2026-01-01T00:00:00Z" }),
      initiative("33333333-2222-4333-8444-000000000002", CM_OWNER, { title: "Twin Road", created_at: "2026-05-01T00:00:00Z" })
    );
    signIn(NEWBIE);
  });

  it("is case-insensitive", async () => {
    expect((await createProjectRepository().findProjectBySlug("Kibera-Water-KIOSK"))?.id).toBe(P);
    expect((await createProjectRepository().findProjectBySlug(P.toUpperCase()))?.id).toBe(P);
  });

  it("resolves the bare base slug of a collided title to the oldest project", async () => {
    const repo = createProjectRepository();
    expect((await repo.findProjectBySlug("twin-road"))?.id).toBe("22222222-2222-4333-8444-000000000001");
    expect((await repo.findProjectBySlug("twin-road-33333333"))?.id).toBe("33333333-2222-4333-8444-000000000002");
    expect(await repo.findProjectBySlug("secret")).toBeUndefined(); // another user's draft
  });
});
