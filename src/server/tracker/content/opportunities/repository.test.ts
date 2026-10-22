import { describe, expect, it } from "vitest";
import type { Opportunity, OpportunityApplication } from "@/types";
import { createApplicationRepository } from "./applications";
import { createEngagementRepository } from "./engagement";
import { createOpportunityRepository, opportunityIdsByAuthor } from "./repository";
import { fakeClients, type FakeState } from "./fake.test-helpers";

const NOW = () => new Date("2026-10-22T07:00:00Z");
const AUTHOR = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "aaaaaaaa-0000-4000-8000-000000000002";
const OPP = "bf2f216e-e810-4518-aeff-8d7276868390";
const OPP2 = "7aec8598-4dfa-4f2e-87dc-202335739256";

function oppRow(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    author_id: AUTHOR,
    initiative_id: null,
    kind: "call",
    title,
    organization: null,
    category: "Job",
    description: null,
    eligibility: null,
    how_to_apply: null,
    apply_url: null,
    amount: null,
    deadline: "2026-12-01",
    location: "Kibra, Nairobi",
    slots: "5",
    listing_status: "published",
    created_at: `2026-09-0${id === OPP ? 1 : 2}T00:00:00Z`,
    ...extra,
  };
}

function state(extra: Partial<FakeState> = {}): FakeState {
  return {
    userId: AUTHOR,
    calls: [],
    tables: {
      opportunities: [oppRow(OPP, "Road Jobs"), oppRow(OPP2, "Road Jobs")],
      political_figures: [{ id: "pf-1", user_id: AUTHOR, created_at: "2026-01-01" }],
      initiatives: [],
      blogs: [],
      opportunity_applications: [],
      saved_opportunities: [],
      contact_submissions: [],
    },
    ...extra,
  };
}

describe("opportunity repository", () => {
  it("gives colliding titles id-suffixed slugs and finds by slug or uuid", async () => {
    const repo = createOpportunityRepository(fakeClients(state()), { now: NOW });
    const items = await repo.listOpportunities();
    expect(items.map((item) => item.slug).sort()).toEqual(["road-jobs-7aec8598", "road-jobs-bf2f216e"]);
    expect(items.every((item) => item.leaderId === "pf-1")).toBe(true);
    expect((await repo.findOpportunityBySlug("road-jobs-7aec8598"))?.id).toBe(OPP2);
    expect((await repo.findOpportunityBySlug(OPP))?.id).toBe(OPP);
    expect(await repo.findOpportunity("opp-001")).toBeUndefined();
    expect((await repo.listOpportunitiesByIds([OPP2, "nope", OPP])).map((item) => item.id)).toEqual([OPP2, OPP]);
  });

  it("updates without touching slots, amount or author", async () => {
    const db = state();
    const repo = createOpportunityRepository(fakeClients(db), { now: NOW });
    const current = (await repo.findOpportunity(OPP)) as Opportunity;
    await repo.upsertOpportunity({ ...current, title: "Road Jobs Phase 2" });
    const update = db.calls.find((call) => call.op === "update");
    expect(update?.values).not.toHaveProperty("slots");
    expect(update?.values).not.toHaveProperty("amount");
    expect(update?.values).not.toHaveProperty("author_id");
    expect(db.tables.opportunities[0]).toMatchObject({ title: "Road Jobs Phase 2", slots: "5" });
  });

  it("retries without the M5b columns when they are missing", async () => {
    const db = state({
      fail: [{ table: "opportunities", op: "insert", error: { code: "PGRST204", message: "column county missing" } }],
    });
    const repo = createOpportunityRepository(fakeClients(db), { now: NOW });
    const saved = await repo.upsertOpportunity({
      id: "opp-new",
      slug: "",
      title: "Tender for desks",
      category: "tenders",
      location: "",
      county: "Kisumu",
      deadline: "",
      eligibility: "",
      description: "",
    });
    const inserts = db.calls.filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toHaveProperty("county", "Kisumu");
    expect(inserts[1].values).not.toHaveProperty("county");
    expect(inserts[1].values).toMatchObject({ author_id: AUTHOR, kind: "call", category: "Tender", deadline: null });
    expect(inserts[1].values).not.toHaveProperty("id");
    expect(saved.title).toBe("Tender for desks");
  });

  it("refuses to edit another author's listing", async () => {
    const db = state({ userId: OTHER });
    const repo = createOpportunityRepository(fakeClients(db), { now: NOW });
    const current = (await repo.findOpportunity(OPP)) as Opportunity;
    await expect(repo.upsertOpportunity(current)).rejects.toThrow(/author/);
  });

  it("lists opportunity ids per author", async () => {
    const map = await opportunityIdsByAuthor([AUTHOR, OTHER, "not-a-uuid"], fakeClients(state()));
    expect(map.get(AUTHOR)).toEqual([OPP2, OPP]);
    expect(map.get(OTHER)).toEqual([]);
    expect(map.get("not-a-uuid")).toEqual([]);
  });
});

describe("application repository", () => {
  const app: OpportunityApplication = {
    id: "app-local",
    opportunityId: OPP,
    applicantId: OTHER,
    fullName: "Jane",
    email: "jane@example.com",
    phone: "+254700000000",
    message: "I would like to apply for this.",
    status: "submitted",
    createdAt: "",
    updatedAt: "",
  };

  it("inserts as the session user and refuses spoofed applicants", async () => {
    const db = state({ userId: OTHER });
    const repo = createApplicationRepository(fakeClients(db), { now: NOW });
    const saved = await repo.upsert(app);
    expect(saved).toMatchObject({ opportunityId: OPP, applicantId: OTHER, status: "submitted" });
    await expect(repo.upsert({ ...app, applicantId: AUTHOR })).rejects.toThrow(/yourself/);
  });

  it("maps a duplicate (M6 unique index) to a clear error", async () => {
    const db = state({
      userId: OTHER,
      fail: [{ table: "opportunity_applications", op: "insert", error: { code: "23505", message: "dup" } }],
    });
    await expect(createApplicationRepository(fakeClients(db)).upsert(app)).rejects.toThrow(/already applied/);
  });

  it("stores shortlisted as reviewed when the CHECK list lacks it", async () => {
    const db = state({
      fail: [
        {
          table: "opportunity_applications",
          op: "update",
          error: { code: "23514", message: "check" },
          when: (call) => (call.values as { status?: string }).status === "shortlisted",
        },
      ],
    });
    db.tables.opportunity_applications.push({
      id: "cccccccc-0000-4000-8000-000000000001",
      opportunity_id: OPP,
      applicant_id: OTHER,
      full_name: "Jane",
      email: "jane@example.com",
      phone: null,
      message: "hi",
      status: "pending",
      created_at: "2026-10-20T00:00:00Z",
    });
    const repo = createApplicationRepository(fakeClients(db), { now: NOW });
    const existing = (await repo.find("cccccccc-0000-4000-8000-000000000001"))!;
    const saved = await repo.upsert({ ...existing, status: "shortlisted" });
    expect(saved.status).toBe("reviewing");
    const updates = db.calls.filter((call) => call.op === "update");
    expect(updates.map((call) => (call.values as { status: string }).status)).toEqual(["shortlisted", "reviewed"]);
  });

  it("reports false when RLS lets nothing be deleted", async () => {
    const db = state();
    const repo = createApplicationRepository(fakeClients(db));
    expect(await repo.delete("cccccccc-0000-4000-8000-000000000009")).toBe(false);
    expect(await repo.delete("app-1")).toBe(false);
  });

  it("listAll uses the service client", async () => {
    const service = state();
    service.tables.opportunity_applications.push({ id: "x", opportunity_id: OPP, status: "accepted", created_at: "" });
    const repo = createApplicationRepository(fakeClients(state(), service));
    expect((await repo.listAll()).map((item) => item.status)).toEqual(["accepted"]);
    expect(await repo.list()).toEqual([]);
  });
});

describe("engagement repository", () => {
  it("saves the diff of opportunity ids for the session user only", async () => {
    const db = state();
    db.tables.saved_opportunities.push({ user_id: AUTHOR, opportunity_id: OPP, created_at: "1" });
    const repo = createEngagementRepository(fakeClients(db));
    expect(await repo.setSavedOpportunityIds(AUTHOR, [OPP2, OPP2, "opp-001"])).toEqual([OPP2]);
    expect(await repo.getSavedOpportunityIds(AUTHOR)).toEqual([OPP2]);
    await expect(repo.getSavedOpportunityIds(OTHER)).rejects.toThrow(/own/);
  });

  it("reads nothing saved before M8 and refuses to save", async () => {
    const missing = { code: "PGRST205", message: "no table" };
    const db = state({
      fail: [
        { table: "saved_opportunities", op: "select", error: missing },
        { table: "saved_opportunities", op: "select", error: missing },
      ],
    });
    const repo = createEngagementRepository(fakeClients(db));
    expect(await repo.getSavedOpportunityIds(AUTHOR)).toEqual([]);
    await expect(repo.setSavedOpportunityIds(AUTHOR, [OPP])).rejects.toThrow(/M8/);
  });

  it("adds Adly leads with anon and without RETURNING; lists with service", async () => {
    const db = state();
    const repo = createEngagementRepository(fakeClients(db));
    const lead = await repo.addAdlyInterest({
      fullName: "Amina",
      email: "amina@example.com",
      phone: "+254711000001",
      organization: "",
      role: "Politician",
      interests: ["Advertising"],
      createdAt: "2026-10-22T08:00:00Z",
    });
    expect(lead.id).toMatch(/^[0-9a-f-]{36}$/);
    db.tables.contact_submissions.push({ id: "z", name: "x", email: "y", subject: "General", message: "m", created_at: "0" });
    const leads = await repo.listAdlyInterests();
    expect(leads).toEqual([{ ...lead }]);
  });
});
