import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, Opportunity, Poll, Product, Project, ProjectMilestone } from "@/types";
import type { ContentRepository } from "@/server/repositories";

/**
 * Ownership rule in Tracker mode (docs/tracker-backend.md): authorization is
 * by the row owner's auth user id against the verified session.userId, or
 * admin. leaderId is display / linking only. A fake content repository stands
 * in for the Tracker adapter; records carry ownerUserId like the real one.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const NO_FIGURE = "44444444-4444-4444-8444-444444444444";
const FIGURE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_PROJECT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEDIA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const POLL = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MILESTONE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const OPPORTUNITY = "abababab-abab-4bab-8bab-abababababab";
const PRODUCT = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
/** A row that exists but row-level security hides from the caller. */
const HIDDEN = "efefefef-efef-4fef-8fef-efefefefefef";

type Owned<T> = T & { ownerUserId?: string };

const state = vi.hoisted(() => ({
  tracker: true,
  content: null as unknown as ContentRepository,
}));

vi.mock("@/server", () => ({
  usesTracker: () => state.tracker,
  getRepositories: () => ({ content: state.content }),
}));

const { saveCollection, deleteCollection } = await import("@/server/content/service");
const { ProjectAccessError } = await import("@/server/tracker/content/projects/repository");
const { reportWarning } = await import("@/server/tracker/warnings");

const owner = { role: "leader" as const, userId: OWNER, leaderId: FIGURE };
/** Another user whose session leaderId equals the owner's figure id: must not matter. */
const impostor = { role: "leader" as const, userId: OTHER, leaderId: FIGURE };
const admin = { role: "admin" as const, userId: ADMIN };
/** Phase 1: a politician with no political_figures row. */
const phase1 = { role: "aspirant" as const, userId: NO_FIGURE, leaderId: `user-${NO_FIGURE}` };

function project(over: Partial<Project> = {}): Owned<Project> {
  return {
    id: PROJECT,
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
    leaderIds: [FIGURE],
    geo: { center: { lat: -1.2, lng: 36.9 } },
    milestoneIds: [],
    opportunityIds: [],
    mediaIds: [],
    ...over,
  };
}

function media(over: Partial<Owned<MediaItem>> = {}): Owned<MediaItem> {
  return {
    id: MEDIA,
    slug: "update",
    title: "Update",
    category: "news",
    type: "article",
    image: "",
    date: "2026-10-20",
    excerpt: "",
    leaderId: FIGURE,
    ownerUserId: OWNER,
    ...over,
  };
}

function poll(over: Partial<Owned<Poll>> = {}): Owned<Poll> {
  return {
    id: POLL,
    slug: "q",
    question: "Which road first?",
    options: [{ id: "o1", label: "A", votes: 0 }],
    closingDate: "",
    participationCount: 0,
    leaderId: `user-${NO_FIGURE}`,
    ownerUserId: NO_FIGURE,
    ...over,
  };
}

function opportunity(over: Partial<Owned<Opportunity>> = {}): Owned<Opportunity> {
  return {
    id: OPPORTUNITY,
    slug: "road-jobs",
    title: "Road jobs",
    category: "jobs" as Opportunity["category"],
    location: "Githurai",
    county: "Nairobi",
    deadline: "2026-12-01",
    eligibility: "",
    description: "Casual work",
    leaderId: FIGURE,
    ownerUserId: OWNER,
    ...over,
  };
}

function product(over: Partial<Owned<Product>> = {}): Owned<Product> {
  return {
    id: PRODUCT,
    slug: "cap",
    name: "Cap",
    price: 500,
    currency: "KES",
    image: "",
    description: "",
    stock: 10,
    leaderId: FIGURE,
    ownerUserId: OWNER,
    ...over,
  };
}

interface Fake {
  repo: ContentRepository;
  projects: Map<string, Owned<Project>>;
  owners: Map<string, string>;
  media: Map<string, Owned<MediaItem>>;
  polls: Map<string, Owned<Poll>>;
  milestones: Map<string, ProjectMilestone>;
  opportunities: Map<string, Owned<Opportunity>>;
  products: Map<string, Owned<Product>>;
  donations: Map<string, number>;
  calls: string[];
}

function fakeContent(): Fake {
  const projects = new Map([[PROJECT, project()], [OTHER_PROJECT, project({ id: OTHER_PROJECT, slug: "other", leaderIds: [FIGURE] })]]);
  // OTHER_PROJECT lists the owner's figure as a co-leader but belongs to OTHER.
  const owners = new Map([[PROJECT, OWNER], [OTHER_PROJECT, OTHER]]);
  const mediaItems = new Map([[MEDIA, media()]]);
  const polls = new Map([[POLL, poll()]]);
  const milestones = new Map<string, ProjectMilestone>([
    [MILESTONE, { id: MILESTONE, projectId: OTHER_PROJECT, number: 1, date: "2026-11-01", title: "Survey", description: "", status: "upcoming" }],
  ]);
  const opportunities = new Map([[OPPORTUNITY, opportunity()]]);
  const products = new Map([[PRODUCT, product()]]);
  const donations = new Map<string, number>();
  const calls: string[] = [];
  const unused = async () => {
    throw new Error("not used in this test");
  };
  const repo = {
    snapshot: unused,
    reset: unused,
    listLeaders: async () => [],
    findLeader: async () => undefined,
    findLeaderBySlug: async () => undefined,
    upsertLeader: async (item: unknown) => {
      calls.push("upsertLeader");
      return item;
    },
    deleteLeader: unused,
    listProjects: async () => [...projects.values()],
    findProject: async (id: string) => projects.get(id),
    findProjectBySlug: async () => undefined,
    listProjectsByIds: unused,
    upsertProject: async (item: Project) => {
      calls.push(`upsertProject:${item.id}`);
      if (item.id === "rls-refuses") throw new ProjectAccessError("You cannot change this project.");
      if (item.id === "db-breaks") throw new Error('Tracker initiatives write failed: relation "initiatives" violates check');
      return { ...item, id: projects.has(item.id) ? item.id : "99999999-9999-4999-8999-999999999999" };
    },
    deleteProject: async (id: string) => {
      calls.push(`deleteProject:${id}`);
      return true;
    },
    listMilestones: async () => [...milestones.values()],
    findMilestone: async (id: string) => milestones.get(id),
    listMilestonesByProject: async (projectId: string) => [...milestones.values()].filter((m) => m.projectId === projectId),
    upsertMilestone: async (item: ProjectMilestone) => {
      calls.push(`upsertMilestone:${item.projectId}`);
      return item;
    },
    deleteMilestone: async (id: string) => {
      calls.push(`deleteMilestone:${id}`);
      return true;
    },
    listOpportunities: async () => [...opportunities.values()],
    findOpportunity: async (id: string) => opportunities.get(id),
    findOpportunityBySlug: async () => undefined,
    listOpportunitiesByIds: unused,
    upsertOpportunity: async (item: Opportunity) => {
      calls.push(`upsertOpportunity:${item.id}`);
      return { ...item, ownerUserId: opportunities.get(item.id)?.ownerUserId };
    },
    deleteOpportunity: async (id: string) => {
      calls.push(`deleteOpportunity:${id}`);
      return true;
    },
    listMedia: async () => [...mediaItems.values()],
    findMedia: async (id: string) => mediaItems.get(id),
    findMediaBySlug: async () => undefined,
    listMediaByIds: unused,
    upsertMedia: async (item: MediaItem) => {
      calls.push(`upsertMedia:${item.leaderId}`);
      if (item.title === "With gallery") reportWarning("Gallery photos were not saved: Tracker migration M3 is not applied.");
      return { ...item, ownerUserId: mediaItems.get(item.id)?.ownerUserId };
    },
    deleteMedia: async (id: string) => {
      calls.push(`deleteMedia:${id}`);
      return true;
    },
    listPolls: async () => [...polls.values()],
    findPoll: async (id: string) => polls.get(id),
    findPollBySlug: async () => undefined,
    listPollsByIds: unused,
    upsertPoll: async (item: Poll) => {
      calls.push(`upsertPoll:${item.leaderId}`);
      return item;
    },
    deletePoll: async (id: string) => {
      calls.push(`deletePoll:${id}`);
      return true;
    },
    listProducts: async () => [...products.values()],
    findProduct: async (id: string) => products.get(id),
    findProductBySlug: async () => undefined,
    listProductsByLeader: async () => [],
    upsertProduct: async (item: Product) => {
      calls.push(`upsertProduct:${item.id}`);
      return { ...item, ownerUserId: products.get(item.id)?.ownerUserId };
    },
    deleteProduct: async (id: string) => {
      calls.push(`deleteProduct:${id}`);
      return true;
    },
    projectOwnerUserId: async (id: string) => owners.get(id),
    projectDonationCount: async (id: string) => donations.get(id) ?? 0,
  } as unknown as ContentRepository;
  return { repo, projects, owners, media: mediaItems, polls, milestones, opportunities, products, donations, calls };
}

let fake: Fake;
beforeEach(() => {
  state.tracker = true;
  fake = fakeContent();
  state.content = fake.repo;
});

describe("Tracker mode: records owned by an auth user (media, polls)", () => {
  it("lets the owner edit their record", async () => {
    const result = await saveCollection(owner, "media", { ...media(), title: "New title" });
    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(fake.calls).toContain(`upsertMedia:${FIGURE}`);
  });

  it("refuses another user even when their session leaderId is the owner's figure id", async () => {
    const result = await saveCollection(impostor, "media", { ...media(), title: "Hijacked" });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(fake.calls).toEqual([]);
    expect(await deleteCollection(impostor, "media", MEDIA)).toMatchObject({ ok: false, status: 403 });
    expect(fake.calls).toEqual([]);
  });

  it("lets an admin edit and delete anyone's record", async () => {
    expect(await saveCollection(admin, "media", { ...media(), title: "Fixed" })).toMatchObject({ ok: true, status: 200 });
    expect(await deleteCollection(admin, "media", MEDIA)).toMatchObject({ ok: true });
    expect(fake.calls).toContain(`deleteMedia:${MEDIA}`);
  });

  it("lets the owner delete their record", async () => {
    expect(await deleteCollection(owner, "media", MEDIA)).toMatchObject({ ok: true, status: 200 });
  });

  it("treats a phase 1 leader (user-<uid>, no figure row) as the owner of their rows", async () => {
    expect(await saveCollection(phase1, "polls", { ...poll(), question: "Which road next?" })).toMatchObject({
      ok: true,
      status: 200,
    });
    // A new poll is stamped with the phase 1 leader id; the adapter resolves it to the caller.
    const created = await saveCollection(phase1, "polls", {
      question: "New?",
      options: [{ label: "Yes" }, { label: "No" }],
      leaderId: FIGURE,
    });
    expect(created).toMatchObject({ ok: true, status: 201 });
    expect(fake.calls.filter((c) => c.startsWith("upsertPoll"))).toEqual([
      `upsertPoll:user-${NO_FIGURE}`,
      `upsertPoll:user-${NO_FIGURE}`,
    ]);
    // ... and another user cannot touch it, whatever leaderId they claim.
    const other = { role: "leader" as const, userId: OTHER, leaderId: `user-${NO_FIGURE}` };
    expect(await saveCollection(other, "polls", { ...poll(), question: "x" })).toMatchObject({ ok: false, status: 403 });
  });

  it("does not relink leaders or projects (link arrays are derived on the Tracker)", async () => {
    await saveCollection(owner, "media", { ...media(), projectId: PROJECT });
    expect(fake.calls).toEqual([`upsertMedia:${FIGURE}`]);
  });

  it("refuses linking a record to a project the caller does not own, even as a listed co-leader", async () => {
    const result = await saveCollection(owner, "media", { ...media(), projectId: OTHER_PROJECT });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});

describe("Tracker mode: projects and milestones", () => {
  it("lets the project owner edit", async () => {
    expect(await saveCollection(owner, "projects", { ...project(), name: "Githurai roads phase 2" })).toMatchObject({
      ok: true,
      status: 200,
    });
  });

  it("refuses a co-leader whose figure is in leaderIds but who does not own the project", async () => {
    // OTHER_PROJECT.leaderIds contains the owner's FIGURE, but OTHER owns it.
    const result = await saveCollection(owner, "projects", { ...project({ id: OTHER_PROJECT }), name: "Mine now" });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(await deleteCollection(owner, "projects", OTHER_PROJECT)).toMatchObject({ ok: false, status: 403 });
    expect(fake.calls).toEqual([]);
  });

  it("lets an admin edit a project that has no leader (checked on create only)", async () => {
    fake.projects.set(PROJECT, project({ leaderIds: [] }));
    expect(await saveCollection(admin, "projects", { ...project({ leaderIds: [] }), name: "Org project" })).toMatchObject({
      ok: true,
      status: 200,
    });
    expect(
      await saveCollection(admin, "projects", { ...project({ id: "new-project", leaderIds: [] }), name: "No leader" })
    ).toMatchObject({ ok: false, status: 400, error: "A project needs at least one leader." });
  });

  it("adds the creator's phase 1 leader id to a new project", async () => {
    const result = await saveCollection(phase1, "projects", { ...project({ id: "prj-new", leaderIds: [] }), name: "New" });
    expect(result).toMatchObject({ ok: true, status: 201 });
    if (result.ok) expect((result.body.item as Project).leaderIds).toEqual([`user-${NO_FIGURE}`]);
  });

  it("checks milestones against the project owner", async () => {
    const milestone = { id: MILESTONE, projectId: OTHER_PROJECT, title: "Survey", date: "2026-11-01" };
    expect(await saveCollection(owner, "milestones", milestone)).toMatchObject({ ok: false, status: 403 });
    expect(await deleteCollection(owner, "milestones", MILESTONE)).toMatchObject({ ok: false, status: 403 });
    fake.owners.set(OTHER_PROJECT, OWNER);
    expect(await saveCollection(owner, "milestones", milestone)).toMatchObject({ ok: true, status: 200 });
    // No project.milestoneIds bookkeeping in Tracker mode.
    expect(fake.calls).toEqual([`upsertMilestone:${OTHER_PROJECT}`]);
    expect(await saveCollection(admin, "milestones", milestone)).toMatchObject({ ok: true });
  });

  it("answers with a repository error's status, and hides database text", async () => {
    fake.projects.set("rls-refuses", project({ id: "rls-refuses" }));
    fake.owners.set("rls-refuses", OWNER);
    expect(await saveCollection(owner, "projects", project({ id: "rls-refuses" }))).toEqual({
      ok: false,
      status: 403,
      error: "You cannot change this project.",
    });

    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.projects.set("db-breaks", project({ id: "db-breaks" }));
    fake.owners.set("db-breaks", OWNER);
    const broken = await saveCollection(owner, "projects", project({ id: "db-breaks" }));
    log.mockRestore();
    expect(broken).toMatchObject({ ok: false, status: 500 });
    if (!broken.ok) expect(broken.error).not.toMatch(/initiatives|violates/);
  });
});

describe("Tracker mode: opportunities and products follow the owner user id", () => {
  it("lets the owner edit and delete, and an admin too", async () => {
    expect(await saveCollection(owner, "opportunities", { ...opportunity(), title: "Road jobs 2" })).toMatchObject({
      ok: true,
      status: 200,
    });
    expect(await saveCollection(owner, "products", { ...product(), name: "Blue cap" })).toMatchObject({
      ok: true,
      status: 200,
    });
    expect(await deleteCollection(owner, "opportunities", OPPORTUNITY)).toMatchObject({ ok: true });
    expect(await saveCollection(admin, "products", { ...product(), name: "Admin cap" })).toMatchObject({ ok: true });
    expect(await deleteCollection(admin, "products", PRODUCT)).toMatchObject({ ok: true });
    expect(fake.calls).toEqual([
      `upsertOpportunity:${OPPORTUNITY}`,
      `upsertProduct:${PRODUCT}`,
      `deleteOpportunity:${OPPORTUNITY}`,
      `upsertProduct:${PRODUCT}`,
      `deleteProduct:${PRODUCT}`,
    ]);
  });

  it("refuses another user even with the owner's figure id as their session leaderId", async () => {
    expect(await saveCollection(impostor, "opportunities", { ...opportunity(), title: "Mine" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await deleteCollection(impostor, "opportunities", OPPORTUNITY)).toMatchObject({ ok: false, status: 403 });
    expect(await saveCollection(impostor, "products", { ...product(), price: 1 })).toMatchObject({ ok: false, status: 403 });
    expect(await deleteCollection(impostor, "products", PRODUCT)).toMatchObject({ ok: false, status: 403 });
    expect(fake.calls).toEqual([]);
  });

  it("refuses linking an opportunity to a project the caller does not own", async () => {
    expect(
      await saveCollection(owner, "opportunities", { ...opportunity(), projectId: OTHER_PROJECT })
    ).toMatchObject({ ok: false, status: 403 });
    expect(await saveCollection(owner, "opportunities", { ...opportunity(), projectId: PROJECT })).toMatchObject({
      ok: true,
    });
  });
});

describe("Tracker mode: saving an id the caller cannot see", () => {
  it("answers 404 and never creates a new row in its place", async () => {
    expect(await saveCollection(impostor, "opportunities", { ...opportunity({ id: HIDDEN }), title: "Overwrite" })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await saveCollection(impostor, "products", { ...product({ id: HIDDEN }) })).toMatchObject({ ok: false, status: 404 });
    expect(await saveCollection(impostor, "media", { ...media({ id: HIDDEN }) })).toMatchObject({ ok: false, status: 404 });
    expect(await saveCollection(owner, "projects", project({ id: HIDDEN }))).toMatchObject({ ok: false, status: 404 });
    expect(
      await saveCollection(owner, "milestones", { id: HIDDEN, projectId: PROJECT, title: "Survey", date: "2026-11-01" })
    ).toMatchObject({ ok: false, status: 404 });
    expect(fake.calls).toEqual([]);
  });

  it("still creates a record sent with a local (non-uuid) id", async () => {
    const created = await saveCollection(owner, "products", { ...product({ id: "prd-local1" }), name: "New cap" });
    expect(created).toMatchObject({ ok: true, status: 201 });
  });
});

describe("Tracker mode: warnings", () => {
  it("returns repository warnings next to the saved item", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await saveCollection(owner, "media", { ...media(), title: "With gallery" });
    warn.mockRestore();
    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: { warnings: ["Gallery photos were not saved: Tracker migration M3 is not applied."] },
    });
    const plain = await saveCollection(owner, "media", { ...media(), title: "Plain" });
    expect(plain.ok && "warnings" in plain.body).toBe(false);
  });
});

describe("Tracker mode: deleting a project", () => {
  it("refuses with 409 when the project has donations", async () => {
    fake.donations.set(PROJECT, 2);
    expect(await deleteCollection(owner, "projects", PROJECT)).toEqual({
      ok: false,
      status: 409,
      error: "This project has donations; it can't be deleted.",
    });
    expect(await deleteCollection(admin, "projects", PROJECT)).toMatchObject({ ok: false, status: 409 });
    expect(fake.calls).toEqual([]);
  });

  it("deletes the project alone and leaves milestones to the database cascade", async () => {
    fake.owners.set(OTHER_PROJECT, OWNER);
    expect(await deleteCollection(owner, "projects", OTHER_PROJECT)).toMatchObject({ ok: true, status: 200 });
    // OTHER_PROJECT has MILESTONE: no per-milestone delete in Tracker mode.
    expect(fake.calls).toEqual([`deleteProject:${OTHER_PROJECT}`]);
  });

  it("keeps the milestones of a project it refuses to delete (pages send only the project delete)", async () => {
    fake.owners.set(OTHER_PROJECT, OWNER);
    fake.donations.set(OTHER_PROJECT, 1);
    expect(await deleteCollection(owner, "projects", OTHER_PROJECT)).toMatchObject({ ok: false, status: 409 });
    expect(fake.calls).toEqual([]);
    expect(fake.milestones.has(MILESTONE)).toBe(true);
  });

  it("still deletes milestones one by one in memory mode", async () => {
    state.tracker = false;
    fake.donations.set(OTHER_PROJECT, 5); // ignored: memory mode has no donations table
    expect(await deleteCollection(owner, "projects", OTHER_PROJECT)).toMatchObject({ ok: true });
    expect(fake.calls).toEqual([`deleteMilestone:${MILESTONE}`, `deleteProject:${OTHER_PROJECT}`]);
  });
});

describe("Tracker mode: leaders", () => {
  it("authorizes leader edits by the figure's user_id", async () => {
    const leader = {
      id: FIGURE,
      slug: "amina",
      name: "Amina",
      honorific: "Hon.",
      position: "MCA",
      type: "elected",
      county: "Nairobi",
      photo: "",
      shortBio: "",
      bio: "",
      achievements: [],
      social: {},
      projectIds: [],
      opportunityIds: [],
      mediaIds: [],
      pollIds: [],
      productIds: [],
      ownerUserId: OWNER,
    };
    fake.repo.findLeader = async (id: string) => (id === FIGURE ? (leader as never) : undefined);
    expect(await saveCollection(owner, "leaders", { ...leader, bio: "Mine" })).toMatchObject({ ok: true, status: 200 });
    expect(await saveCollection(impostor, "leaders", { ...leader, bio: "Not mine" })).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(await saveCollection(admin, "leaders", { ...leader, bio: "Admin" })).toMatchObject({ ok: true });
  });

  it("lets a politician without a figure row create their own profile, without a stock photo", async () => {
    const result = await saveCollection(phase1, "leaders", { id: `user-${NO_FIGURE}`, name: "Wanjiru", position: "MCA" });
    expect(result).toMatchObject({ ok: true, status: 201 });
    if (result.ok) expect((result.body.item as { photo: string }).photo).toBe("");
  });
});

describe("memory mode keeps the leaderId links of the demo data", () => {
  it("authorizes by leaderId there", async () => {
    state.tracker = false;
    // The memory store relinks leaders and projects: listLeaders is empty here.
    expect(await saveCollection(impostor, "media", { ...media(), title: "Demo edit" })).toMatchObject({ ok: true });
  });
});
