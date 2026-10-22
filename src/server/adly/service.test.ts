import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Leader, Project } from "@/types";
import type { AdlyContent, Simulation, Timelapse } from "@/types/adly";
import type { AdlyRepository, ContentRepository } from "@/server/repositories";

/**
 * Ownership rule in Tracker mode (docs/tracker-backend.md): Adly studio items
 * tied to a project are authorized by the project's owner auth user id
 * (changemakers.user_id), or admin. Project.leaderIds / Leader.projectIds are
 * derived from political_figures.commissioned_projects, which any leader can
 * write on their own row, so they must not grant access.
 */

const VICTIM = "11111111-1111-4111-8111-111111111111";
const ATTACKER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const VICTIM_FIGURE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTACKER_FIGURE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VICTIM_PROJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TIMELAPSE = "tl-victim";
const SIMULATION = "sim-victim";

const state = vi.hoisted(() => ({
  tracker: true,
  content: null as unknown as ContentRepository,
  adly: null as unknown as AdlyRepository,
}));

vi.mock("@/server", () => ({
  usesTracker: () => state.tracker,
  getRepositories: () => ({ content: state.content, adly: state.adly }),
}));

const { createMemoryRepositories } = await import("@/server/memory/database");
const { listAdly, saveAdly, deleteAdly, readWorkspace } = await import("@/server/adly/service");

const victim = { role: "leader" as const, userId: VICTIM, leaderId: VICTIM_FIGURE };
const attacker = { role: "leader" as const, userId: ATTACKER, leaderId: ATTACKER_FIGURE };
const admin = { role: "admin" as const, userId: ADMIN };

function project(): Project {
  return {
    id: VICTIM_PROJECT,
    slug: "roads",
    name: "Githurai roads",
    category: "infrastructure",
    subcategory: "roads",
    location: "Githurai",
    county: "Nairobi",
    status: "planned",
    progress: 0,
    image: "",
    description: "Tarmac",
    startDate: "2026-10-01",
    expectedCompletion: "2027-10-01",
    // Derived from the attacker's commissioned_projects: lists the attacker.
    leaderIds: [VICTIM_FIGURE, ATTACKER_FIGURE],
    geo: { center: { lat: -1.2, lng: 36.9 } },
    milestoneIds: [],
    opportunityIds: [],
    mediaIds: [],
  };
}

function leader(id: string, projectIds: string[]): Leader {
  return { id, projectIds, opportunityIds: [], mediaIds: [], pollIds: [], productIds: [] } as unknown as Leader;
}

const timelapse: Timelapse = {
  id: TIMELAPSE,
  name: "Road progress",
  projectId: VICTIM_PROJECT,
  location: "Githurai",
  startDate: "2026-10-01",
  endDate: "2027-10-01",
  progress: 10,
  aspect: "16:9" as Timelapse["aspect"],
  media: [],
  milestones: [],
  captionsEnabled: true,
  brandingEnabled: true,
  createdAt: "2026-10-01T00:00:00.000Z",
};

const simulation: Simulation = {
  id: SIMULATION,
  title: "Finished road",
  description: "",
  developmentType: "road" as Simulation["developmentType"],
  locationLabel: "Githurai",
  geo: { lat: -1.2, lng: 36.9 },
  expectedOutcome: "",
  style: "photoreal",
  beforeImage: "",
  afterImage: "",
  projectId: VICTIM_PROJECT,
  createdAt: "2026-10-01T00:00:00.000Z",
  isAiSimulation: true,
};

function fakeContent(): ContentRepository {
  const leaders = new Map([
    [VICTIM_FIGURE, leader(VICTIM_FIGURE, [VICTIM_PROJECT])],
    // The attacker listed the victim's project in their own commissioned_projects.
    [ATTACKER_FIGURE, leader(ATTACKER_FIGURE, [VICTIM_PROJECT])],
  ]);
  return {
    findProject: async (id: string) => (id === VICTIM_PROJECT ? project() : undefined),
    listProjects: async () => [project()],
    findLeader: async (id: string) => leaders.get(id),
    projectOwnerUserId: async (id: string) => (id === VICTIM_PROJECT ? VICTIM : undefined),
  } as unknown as ContentRepository;
}

beforeEach(async () => {
  state.tracker = true;
  state.content = fakeContent();
  state.adly = createMemoryRepositories().adly;
  const empty: AdlyContent = {
    campaigns: [],
    creatives: [],
    policyReviews: [],
    posters: [],
    timelapses: [timelapse],
    simulations: [simulation],
    insights: [],
  };
  await state.adly.replace(empty);
});

describe("Tracker mode: Adly items on a project follow the project's owner user id", () => {
  it("hides the victim's timelapses and simulations from a leader who commissioned the project", async () => {
    const workspace = await readWorkspace(attacker);
    expect(workspace.ok).toBe(true);
    if (workspace.ok) {
      const content = workspace.body.content as AdlyContent;
      expect(content.timelapses).toEqual([]);
      expect(content.simulations).toEqual([]);
    }
    const listed = await listAdly(attacker, "timelapses", new URLSearchParams());
    expect(listed).toMatchObject({ ok: true, body: { items: [] } });
    expect(await listAdly(attacker, "timelapses", new URLSearchParams({ id: TIMELAPSE }))).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await listAdly(attacker, "simulations", new URLSearchParams({ id: SIMULATION }))).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("refuses editing or deleting the victim's timelapses and simulations", async () => {
    expect(await saveAdly(attacker, "timelapses", { ...timelapse, name: "Mine" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await saveAdly(attacker, "simulations", { ...simulation, title: "Mine" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await deleteAdly(attacker, "timelapses", TIMELAPSE)).toMatchObject({ ok: false, status: 403 });
    expect(await deleteAdly(attacker, "simulations", SIMULATION)).toMatchObject({ ok: false, status: 403 });
    // Nothing changed.
    const after = await state.adly.snapshot();
    expect(after.timelapses).toEqual([timelapse]);
    expect(after.simulations).toEqual([simulation]);
  });

  it("refuses new timelapses, simulations, posters and campaigns attached to the victim's project", async () => {
    expect(
      await saveAdly(attacker, "timelapses", { name: "New", projectId: VICTIM_PROJECT, startDate: "2026-10-01" })
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      await saveAdly(attacker, "simulations", {
        title: "New",
        projectId: VICTIM_PROJECT,
        geo: { lat: -1.2, lng: 36.9 },
      })
    ).toMatchObject({ ok: false, status: 403 });
    expect(await saveAdly(attacker, "posters", { name: "Rally", projectId: VICTIM_PROJECT })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await saveAdly(attacker, "campaigns", { name: "Push", projectId: VICTIM_PROJECT })).toMatchObject({
      ok: false,
      status: 403,
    });
    const after = await state.adly.snapshot();
    expect(after.posters).toEqual([]);
    expect(after.campaigns).toEqual([]);
  });

  it("lets the project's owner and an admin see and change them", async () => {
    const workspace = await readWorkspace(victim);
    if (workspace.ok) expect((workspace.body.content as AdlyContent).timelapses).toHaveLength(1);
    expect(await saveAdly(victim, "timelapses", { ...timelapse, name: "Updated" })).toMatchObject({
      ok: true,
      status: 200,
    });
    expect(await saveAdly(victim, "posters", { name: "Rally", projectId: VICTIM_PROJECT })).toMatchObject({
      ok: true,
      status: 201,
    });
    expect(await saveAdly(admin, "simulations", { ...simulation, title: "Admin" })).toMatchObject({ ok: true });
    expect(await deleteAdly(admin, "timelapses", TIMELAPSE)).toMatchObject({ ok: true });
  });
});

describe("memory mode keeps the leader links of the demo data", () => {
  it("lets a leader listed on the project edit its timelapse", async () => {
    state.tracker = false;
    expect(await saveAdly(attacker, "timelapses", { ...timelapse, name: "Demo edit" })).toMatchObject({ ok: true });
  });
});
