import { describe, expect, it } from "vitest";
import type { Opportunity, OpportunityApplication } from "@/types";
import { createApplicationRepository } from "./applications";
import { createEngagementRepository } from "./engagement";
import { createOpportunityRepository, opportunityIdsByAuthor } from "./repository";
import { ownerUserIdOf } from "@/server/tracker/content/media/shared";
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

  const tender: Opportunity = {
    id: "opp-new",
    slug: "",
    title: "Tender for desks",
    category: "tenders",
    location: "",
    county: "",
    deadline: "",
    eligibility: "",
    description: "",
  };
  const missingCounty = {
    table: "opportunities",
    op: "insert" as const,
    error: { code: "PGRST204", message: "Could not find the 'county' column of 'opportunities' in the schema cache" },
  };

  it("retries without the M5b columns when they are missing and carry no data", async () => {
    const db = state({ fail: [missingCounty] });
    const repo = createOpportunityRepository(fakeClients(db), { now: NOW });
    const saved = await repo.upsertOpportunity(tender);
    const inserts = db.calls.filter((call) => call.op === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values).toHaveProperty("county", null);
    expect(inserts[1].values).not.toHaveProperty("county");
    expect(inserts[1].values).not.toHaveProperty("benefits");
    expect(inserts[1].values).toMatchObject({ author_id: AUTHOR, kind: "call", category: "Tender", deadline: null });
    expect(inserts[1].values).not.toHaveProperty("id");
    expect(saved.title).toBe("Tender for desks");
  });

  it("refuses with 501, naming the fields, instead of dropping M5b data", async () => {
    const db = state({ fail: [missingCounty] });
    const repo = createOpportunityRepository(fakeClients(db), { now: NOW });
    const error = await repo
      .upsertOpportunity({ ...tender, county: "Kisumu", requirements: ["KRA PIN"] })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 501, code: "not_implemented" });
    expect((error as Error).message).toMatch(/county, requirements/);
    expect((error as Error).message).toMatch(/M5b/);
    expect(db.calls.filter((call) => call.op === "insert")).toHaveLength(1);
    expect(db.tables.opportunities).toHaveLength(2);
  });

  it("re-probes the M5b columns after 60 seconds instead of caching 'missing' forever", async () => {
    let clock = new Date("2026-10-22T07:00:00Z");
    const db = state({ fail: [missingCounty] });
    const repo = createOpportunityRepository(fakeClients(db), { now: () => clock });
    await repo.upsertOpportunity(tender);
    // Within 60 s an empty-extra write skips the doomed full attempt.
    await repo.upsertOpportunity({ ...tender, title: "Tender 2" });
    expect(db.calls.filter((call) => call.op === "insert").map((call) => "county" in (call.values as object))).toEqual([
      true,
      false,
      false,
    ]);
    // After 60 s the migration may have landed: the full payload is tried again.
    clock = new Date("2026-10-22T07:01:01Z");
    await repo.upsertOpportunity({ ...tender, title: "Tender 3" });
    const last = db.calls.filter((call) => call.op === "insert").at(-1);
    expect(last?.values).toHaveProperty("county", null);
    // A write that carries data always tries the full payload, even within 60 s.
    db.fail = [missingCounty];
    await repo.upsertOpportunity({ ...tender, title: "Tender 4" });
    await expect(repo.upsertOpportunity({ ...tender, title: "Tender 5", county: "Kisumu" })).resolves.toMatchObject({
      county: "Kisumu",
    });
  });

  it("reopens an expired listing whose deadline is extended (stored row decides)", async () => {
    const db = state();
    db.tables.opportunities[0].deadline = "2026-10-01";
    const repo = createOpportunityRepository(fakeClients(db), { now: NOW });
    const current = (await repo.findOpportunity(OPP)) as Opportunity;
    expect(current.status).toBe("closed");
    const saved = await repo.upsertOpportunity({ ...current, deadline: "2026-12-15" });
    expect(db.tables.opportunities[0]).toMatchObject({ listing_status: "published", deadline: "2026-12-15" });
    expect(saved.status).toBe("open");
  });

  it("gives author and public the same slug for published listings", async () => {
    const author = state();
    author.tables.opportunities.push(
      oppRow("cccccccc-0000-4000-8000-000000000003", "Water Kiosk", { listing_status: "closed" }),
      oppRow("dddddddd-0000-4000-8000-000000000004", "Water Kiosk")
    );
    // The public cannot see the author's closed row.
    const pub = { ...author, tables: { ...author.tables, opportunities: author.tables.opportunities.filter((row) => row.listing_status === "published") } };
    const asAuthor = await createOpportunityRepository(fakeClients(author), { now: NOW }).listOpportunities();
    const asPublic = await createOpportunityRepository(fakeClients(pub), { now: NOW }).listOpportunities();
    const slugOf = (items: Opportunity[], id: string) => items.find((item) => item.id === id)?.slug;
    expect(slugOf(asAuthor, "dddddddd-0000-4000-8000-000000000004")).toBe("water-kiosk");
    expect(slugOf(asPublic, "dddddddd-0000-4000-8000-000000000004")).toBe("water-kiosk");
    // The closed row never takes the published listing's slug.
    expect(slugOf(asAuthor, "cccccccc-0000-4000-8000-000000000003")).toBe("water-kiosk-cccccccc");
    const repo = createOpportunityRepository(fakeClients(author), { now: NOW });
    expect((await repo.findOpportunityBySlug("water-kiosk"))?.id).toBe("dddddddd-0000-4000-8000-000000000004");
    expect((await repo.findOpportunityBySlug("water-kiosk-cccccccc"))?.id).toBe("cccccccc-0000-4000-8000-000000000003");
  });

  it("uses the author's oldest figure as leaderId and exposes ownerUserId", async () => {
    const db = state();
    db.tables.political_figures.push({ id: "pf-later", user_id: AUTHOR, created_at: "2026-09-01" });
    const item = await createOpportunityRepository(fakeClients(db), { now: NOW }).findOpportunity(OPP);
    expect(item?.leaderId).toBe("pf-1");
    expect(ownerUserIdOf(item)).toBe(AUTHOR);
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

  it("answers 501 for shortlisted when the CHECK list lacks it, never storing reviewed", async () => {
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
    await expect(repo.upsert({ ...existing, status: "shortlisted" })).rejects.toMatchObject({
      status: 501,
      code: "not_implemented",
    });
    const updates = db.calls.filter((call) => call.op === "update");
    expect(updates.map((call) => (call.values as { status: string }).status)).toEqual(["shortlisted"]);
    expect(db.tables.opportunity_applications[0].status).toBe("pending");
  });

  it("refuses with 501 to drop an applicant's county/attachment before M6", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'attachment_url' column of 'opportunity_applications'" };
    const withM6 = (call: { values?: unknown }) => "attachment_url" in (call.values as object);
    const db = state({
      userId: OTHER,
      fail: [{ table: "opportunity_applications", op: "insert", error: missing, when: withM6 }],
    });
    const repo = createApplicationRepository(fakeClients(db), { now: NOW });
    await expect(repo.upsert({ ...app, county: "Nairobi" })).rejects.toMatchObject({ status: 501 });
    expect(db.tables.opportunity_applications).toHaveLength(0);
    // Without M6 data the retry is harmless.
    db.fail = [{ table: "opportunity_applications", op: "insert", error: missing, when: withM6 }];
    await expect(repo.upsert(app)).resolves.toMatchObject({ applicantId: OTHER });
    expect(db.tables.opportunity_applications[0]).not.toHaveProperty("county");
  });

  it("reports false when RLS lets nothing be deleted", async () => {
    const db = state();
    const repo = createApplicationRepository(fakeClients(db));
    expect(await repo.delete("cccccccc-0000-4000-8000-000000000009")).toBe(false);
    expect(await repo.delete("app-1")).toBe(false);
  });

  it("listAll checks the admin role, then uses the service client", async () => {
    const service = state();
    service.tables.opportunity_applications.push({ id: "x", opportunity_id: OPP, status: "accepted", created_at: "" });
    const repo = createApplicationRepository(fakeClients(state({ appRole: "admin" }), service));
    expect((await repo.listAll()).map((item) => item.status)).toEqual(["accepted"]);
    expect(await repo.list()).toEqual([]);
  });

  it("findAsAdmin / reviewAsAdmin check the admin role, then use the service client", async () => {
    const ID = "cccccccc-0000-4000-8000-000000000002";
    const service = state();
    service.tables.opportunity_applications.push({
      id: ID,
      opportunity_id: OPP,
      applicant_id: OTHER,
      full_name: "Jane",
      email: "jane@example.com",
      status: "pending",
      created_at: "2026-10-20T00:00:00Z",
    });
    const user = state({ appRole: "admin", userId: OTHER });
    const repo = createApplicationRepository(fakeClients(user, service), { now: NOW });
    // RLS: the admin's own client sees nothing.
    expect(await repo.find(ID)).toBeUndefined();
    const found = await repo.findAsAdmin(ID);
    expect(found).toMatchObject({ id: ID, applicantId: OTHER });
    const saved = await repo.reviewAsAdmin({ ...found!, status: "accepted" });
    expect(saved.status).toBe("accepted");
    expect(service.tables.opportunity_applications[0].status).toBe("accepted");
    expect(user.calls.filter((call) => call.table === "opportunity_applications" && call.op !== "select")).toEqual([]);
    // Review only: an unknown id is never inserted.
    await expect(repo.reviewAsAdmin({ ...found!, id: "cccccccc-0000-4000-8000-000000000099" })).rejects.toMatchObject({
      status: 404,
    });
    expect(service.tables.opportunity_applications).toHaveLength(1);
  });

  it("findAsAdmin / reviewAsAdmin refuse non-admins before touching the service client", async () => {
    const service = state();
    const repo = createApplicationRepository(fakeClients(state(), service));
    await expect(repo.findAsAdmin("cccccccc-0000-4000-8000-000000000002")).rejects.toMatchObject({ status: 403 });
    await expect(repo.reviewAsAdmin({ ...app, id: "cccccccc-0000-4000-8000-000000000002" })).rejects.toMatchObject({
      status: 403,
    });
    expect(service.calls).toHaveLength(0);
  });

  it("listAll refuses non-admins (403) and signed-out callers (401) before touching the service client", async () => {
    const service = state();
    await expect(createApplicationRepository(fakeClients(state(), service)).listAll()).rejects.toMatchObject({ status: 403 });
    await expect(
      createApplicationRepository(fakeClients(state({ userId: undefined }), service)).listAll()
    ).rejects.toMatchObject({ status: 401 });
    expect(service.calls).toHaveLength(0);
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

  it("refuses to list Adly leads for a non-admin (403)", async () => {
    const service = state();
    await expect(createEngagementRepository(fakeClients(state(), service)).listAdlyInterests()).rejects.toMatchObject({
      status: 403,
    });
    expect(service.calls).toHaveLength(0);
  });

  it("adds Adly leads with anon and without RETURNING; lists with service", async () => {
    const db = state({ appRole: "admin" });
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
