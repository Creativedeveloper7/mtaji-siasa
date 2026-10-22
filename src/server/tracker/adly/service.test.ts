import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/types/auth";
import type { ContentActor } from "@/server/content/service";
import type { AdlyCampaignRow } from "@/server/tracker/adly/rows";
import { FakeDb } from "@/server/tracker/adly/fake-supabase";
import { adComposerToRow, readSiasaMeta, rowToAdCampaign, withSiasaMeta } from "@/server/tracker/adly/mapping";
import { OWNER, trackerLiveRow } from "@/server/tracker/adly/test-fixtures";

/**
 * Service-level tests: the real service + repository + mapping, against an
 * in-memory Supabase (fake-supabase.ts). Only the network edges are faked:
 * the edge functions, the wallet RPCs and the content repository.
 */

const h = vi.hoisted(() => ({
  db: null as unknown as import("@/server/tracker/adly/fake-supabase").FakeDb,
  userId: "",
  balance: 100_000,
  debit: vi.fn(),
  debitUpdate: vi.fn(),
  callEdge: vi.fn(),
  findProject: vi.fn(),
}));

vi.mock("@/server/tracker/clients", () => ({
  userClient: async () => h.db.client(h.userId),
  serviceClient: () => h.db.client(),
}));

vi.mock("@/server/tracker/wallet/service", () => ({
  signedInWalletUser: async (expected?: string) =>
    expected && expected !== h.userId
      ? { ok: false, status: 401, error: "Sign in required." }
      : { ok: true, status: 200, data: { client: h.db.client(h.userId), userId: h.userId, accessToken: "token" } },
  trackerAvailableBalance: async () => ({ ok: true, status: 200, data: h.balance }),
  debitWalletForAdSpend: (...args: unknown[]) => h.debit(...args),
  debitWalletForAdSpendUpdate: (...args: unknown[]) => h.debitUpdate(...args),
}));

vi.mock("@/server/tracker/adly/edge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/tracker/adly/edge")>()),
  callEdge: (...args: unknown[]) => h.callEdge(...args),
}));

vi.mock("@/server", () => ({
  getRepositories: () => ({ content: { findProject: (id: string) => h.findProject(id) } }),
}));

vi.mock("@/server/adly/service", () => ({
  visibleAdly: async () => ({ campaigns: [], creatives: [], policyReviews: [], posters: [], timelapses: [], simulations: [], insights: [] }),
}));

const service = await import("@/server/tracker/adly/service");
const repo = await import("@/server/tracker/adly/repository");
const { AdlyError } = await import("@/server/tracker/adly/errors");

const OTHER = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const ADMIN = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60";
const PROJECT = "9c0e7d6b-1a2f-4c3d-8e9f-0a1b2c3d4e5f";

const leaderSession: AuthSession = { userId: OWNER, email: "l@example.org", fullName: "Leader", role: "leader", leaderId: "pf-1" };
const adminSession: AuthSession = { userId: ADMIN, email: "a@example.org", fullName: "Admin", role: "admin" };
const leader: ContentActor = { role: "leader", userId: OWNER, leaderId: "pf-1" };
const admin: ContentActor = { role: "admin", userId: ADMIN };

const DRAFT_ID = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a70";

/** A composer ad waiting for approval, X only. */
function composerRow(overrides: Partial<AdlyCampaignRow> = {}, approved = false): AdlyCampaignRow {
  const write = adComposerToRow(
    {
      name: "Roads ad",
      headline: "New roads in Ruiru",
      body: "See the progress on the Githurai roads.",
      keywords: ["roads"],
      platforms: ["x"],
      budgetKes: 2000,
      durationDays: 5,
      landingUrl: "https://m-taji.co.ke/projects/roads",
      imageUrl: "",
      projectId: PROJECT,
      projectTitle: "Githurai roads",
      leaderId: "pf-1",
      estimatedReach: 20000,
      requireApproval: true,
    },
    OWNER,
    new Date("2026-10-20T08:00:00.000Z")
  );
  const row = {
    id: DRAFT_ID,
    ...write,
    created_at: "2026-10-20T08:00:00.000Z",
    updated_at: "2026-10-20T08:00:00.000Z",
    ...overrides,
  } as AdlyCampaignRow;
  if (approved) {
    row.metadata = withSiasaMeta(row.metadata, { review: { state: "approved", at: "2026-10-21T08:00:00.000Z", by: ADMIN } });
  }
  return row;
}

function stored(id = DRAFT_ID): AdlyCampaignRow {
  return h.db.get("adly_campaigns", id) as unknown as AdlyCampaignRow;
}

function seed(...rows: AdlyCampaignRow[]) {
  h.db = new FakeDb({ adly_campaigns: rows as unknown as Record<string, unknown>[], wallet_transactions: [], ad_channel_stats: [] });
}

/** The X publish function accepts the ad and stores its ids, like publish-x-ads does. */
function xAccepts() {
  h.callEdge.mockImplementation(async (name: string, _token: string, body: Record<string, unknown>) => {
    if (name === "publish-x-ads") {
      const id = String(body.campaign_id ?? body.campaignId ?? DRAFT_ID);
      const row = h.db.rows("adly_campaigns").find((r) => r.id === id);
      if (row) {
        row.metadata = { ...(row.metadata as object), x_campaign_id: "x-123", x_line_item_id: "li-9" };
        row.status = "live";
        row.updated_at = new Date(Date.parse(String(row.updated_at)) + 5).toISOString();
      }
      return { status: 200, ok: true, json: { status: "submitted", message: "Live on X" } };
    }
    return { status: 200, ok: true, json: {} };
  });
}

beforeEach(() => {
  delete process.env.ADS_REQUIRE_APPROVAL;
  delete process.env.ADS_DRY_RUN;
  h.userId = OWNER;
  h.balance = 100_000;
  h.debit.mockReset().mockResolvedValue({ ok: true, status: 201, data: { transactionId: "tx-1" } });
  h.debitUpdate.mockReset().mockResolvedValue({ ok: true, status: 200, data: { transactionId: null, deltaKes: 0 } });
  h.callEdge.mockReset().mockResolvedValue({ status: 200, ok: true, json: {} });
  h.findProject.mockReset().mockResolvedValue({ id: PROJECT, name: "Githurai roads", leaderIds: ["pf-1"], slug: "roads" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const campaignBody = (extra: Record<string, unknown> = {}) => ({
  name: "Githurai roads",
  objective: "awareness",
  platformIds: ["x"],
  targeting: { county: "Kiambu" },
  startDate: "2026-11-01",
  endDate: "2026-11-10",
  budget: 20000,
  ...extra,
});

describe("H1: status from the client never skips approval", () => {
  it("inserts a new campaign as a draft even when the client says active", async () => {
    seed();
    const res = await service.saveTrackerPlan(leader, { campaign: campaignBody({ id: "cmp_local1", status: "active" }) });
    expect(res.ok).toBe(true);
    const rows = h.db.rows("adly_campaigns");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("draft");
    expect(rows[0].user_id).toBe(OWNER);
  });

  it("ignores a client status change on save (draft cannot become paused)", async () => {
    seed(composerRow());
    const res = await service.saveTrackerPlan(leader, { campaign: { id: DRAFT_ID, status: "paused" } });
    expect(res.ok).toBe(true);
    expect(stored().status).toBe("draft");
  });

  it("refuses to publish without an approval, and calls no network", async () => {
    seed(composerRow());
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(h.callEdge).not.toHaveBeenCalled();
  });

  it("refuses to publish a non-draft row that was never approved or published", async () => {
    seed(composerRow({ status: "paused" }));
    const res = await service.actOnTrackerAd(leaderSession, DRAFT_ID, "publish");
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(h.callEdge).not.toHaveBeenCalled();
  });

  it("publishes once approved", async () => {
    seed(composerRow({}, true));
    xAccepts();
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res.ok).toBe(true);
    expect(h.callEdge).toHaveBeenCalledWith("publish-x-ads", "token", expect.anything());
    expect(h.debit).toHaveBeenCalledTimes(1);
    expect(readSiasaMeta(stored().metadata).publishing).toBeUndefined();
  });
});

describe("H2: edits after approval need a new approval", () => {
  it("resets an approved review to pending when the budget changes, and blocks the publish", async () => {
    seed(composerRow({}, true));
    const res = await service.saveTrackerPlan(leader, { campaign: { id: DRAFT_ID, budget: 9000 } });
    expect(res.ok).toBe(true);
    const review = readSiasaMeta(stored().metadata).review;
    expect(review?.state).toBe("pending");
    expect(review?.note).toMatch(/changed after it was approved/i);
    const publish = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(publish).toMatchObject({ ok: false, status: 409 });
    expect(h.callEdge).not.toHaveBeenCalled();
  });

  it("resets the approval when the creative copy changes", async () => {
    seed(composerRow({}, true));
    const res = await service.saveTrackerCreative(leader, {
      id: `cr_${DRAFT_ID}`,
      name: "c",
      headline: "Different headline",
      body: "Different body",
      cta: "Learn more",
      image: "",
      platformIds: ["x"],
    });
    expect(res.ok).toBe(true);
    expect(readSiasaMeta(stored().metadata).review?.state).toBe("pending");
  });

  it("keeps the approval when nothing publish-relevant changed", async () => {
    seed(composerRow({}, true));
    const res = await service.saveTrackerPlan(leader, { campaign: { id: DRAFT_ID, name: "Renamed only" } });
    expect(res.ok).toBe(true);
    expect(readSiasaMeta(stored().metadata).review?.state).toBe("approved");
  });
});

describe("H3: one publish at a time", () => {
  it("gives the second claim on the same read a 409", async () => {
    seed(composerRow({}, true));
    const row = stored();
    const user = { client: h.db.client(OWNER), userId: OWNER };
    const first = await service.claimPublish(user, row);
    expect(readSiasaMeta(first.row.metadata).publishing?.by).toBe(OWNER);
    await expect(service.claimPublish(user, row)).rejects.toMatchObject({ status: 409 });
    // A fresh read still sees the live claim: 409 without writing.
    await expect(service.claimPublish(user, stored())).rejects.toMatchObject({ status: 409 });
  });

  it("lets a stale claim (older than 5 minutes) be taken over", async () => {
    const old = composerRow({}, true);
    old.metadata = withSiasaMeta(old.metadata, { publishing: { at: "2026-10-20T08:00:00.000Z", by: OWNER } });
    seed(old);
    const claimed = await service.claimPublish({ client: h.db.client(OWNER), userId: OWNER }, stored(), new Date("2026-10-20T08:06:00.000Z"));
    expect(readSiasaMeta(claimed.row.metadata).publishing?.at).toBe("2026-10-20T08:06:00.000Z");
  });

  it("two concurrent publishes create one network campaign", async () => {
    seed(composerRow({}, true));
    xAccepts();
    const [a, b] = await Promise.all([
      service.publishCampaign(leaderSession, DRAFT_ID, {}),
      service.actOnTrackerAd(leaderSession, DRAFT_ID, "publish"),
    ]);
    const statuses = [a, b].map((r) => (r.ok ? 200 : r.status));
    expect(statuses).toContain(409);
    expect(h.callEdge.mock.calls.filter(([name]) => name === "publish-x-ads")).toHaveLength(1);
    expect(readSiasaMeta(stored().metadata).publishing).toBeUndefined();
  });

  it("releases the claim when the network call throws", async () => {
    seed(composerRow({}, true));
    h.callEdge.mockRejectedValue(new Error("socket hang up"));
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.status).toBe(207);
    expect(readSiasaMeta(stored().metadata).publishing).toBeUndefined();
  });
});

describe("H4: a failed debit after the network accepted the ad", () => {
  it("records the network as unpaid, warns, and shows it on the campaign", async () => {
    seed(composerRow({}, true));
    xAccepts();
    h.debit.mockResolvedValue({ ok: false, status: 402, error: "Your wallet balance is too low for this. Top up first." });
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res.ok).toBe(true);
    const body = res.ok ? res.body : {};
    expect((body.warnings as string[])[0]).toMatch(/could not be charged/);
    const unpaid = readSiasaMeta(stored().metadata).unpaid;
    expect(unpaid).toEqual([
      { provider: "x", amountKes: 2000, at: expect.any(String), error: "Your wallet balance is too low for this. Top up first." },
    ]);
    // provider ids written by the edge function survive the unpaid write
    expect((stored().metadata as Record<string, unknown>).x_campaign_id).toBe("x-123");
    const item = rowToAdCampaign(stored());
    expect(item.unpaidKes).toBe(2000);
    expect(item.statusNote).toMatch(/Unpaid/);
    expect(h.debit).toHaveBeenCalledTimes(1); // not retried
  });

  it("lists unpaid campaigns for the admin", async () => {
    const row = composerRow({ status: "live" }, true);
    row.metadata = withSiasaMeta({ ...row.metadata, x_campaign_id: "x-1" }, {
      unpaid: [{ provider: "x", amountKes: 1500, at: "2026-10-21T08:00:00.000Z", error: "e" }],
    });
    seed(row);
    h.userId = ADMIN;
    const res = await service.listTrackerAds(adminSession, "all");
    expect(res.ok).toBe(true);
    const items = (res.ok ? res.body.items : []) as { id: string; unpaidKes?: number }[];
    expect(items.find((i) => i.id === DRAFT_ID)?.unpaidKes).toBe(1500);
  });

  it("checks the available balance (pending withdrawals excluded) before publishing", async () => {
    seed(composerRow({}, true));
    xAccepts();
    h.balance = 500;
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res.ok && res.status).toBe(207);
    expect(h.callEdge).not.toHaveBeenCalledWith("publish-x-ads", expect.anything(), expect.anything());
  });

  it("reports deltaKes 0 when the RPC returns an existing transaction (L6)", async () => {
    seed(composerRow({}, true));
    h.db.rows("wallet_transactions").push({
      id: "tx-old",
      amount: 500,
      metadata: { provider: "x" },
      reference_type: "adly_campaign",
      reference_id: DRAFT_ID,
      direction: "debit",
      source: "ads",
    });
    xAccepts();
    h.debit.mockResolvedValue({ ok: true, status: 201, data: { transactionId: "tx-old" } });
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res.ok).toBe(true);
    const results = (res.ok ? res.body.results : []) as { walletWarning?: string }[];
    expect(results[0].walletWarning).toBeUndefined();
  });
});

describe("M2: optimistic concurrency", () => {
  it("answers 409 when the row changed since it was read", async () => {
    seed(composerRow());
    const stale = stored();
    await repo.updateCampaign(h.db.client(OWNER), stale, { name: "first" });
    await expect(repo.updateCampaign(h.db.client(OWNER), stale, { name: "second" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/changed/),
    });
    expect(stored().name).toBe("first");
  });

  it("never drops provider ids the stored row has", async () => {
    const row = composerRow({ status: "live" }, true);
    row.metadata = { ...row.metadata, google_campaign_id: "g-1", google_ad_group_id: "ag-1" };
    seed(row);
    const current = stored();
    const metadata = { ...(current.metadata as Record<string, unknown>) };
    delete metadata.google_campaign_id;
    metadata.google_ad_group_id = undefined;
    await repo.updateCampaign(h.db.client(OWNER), current, { metadata });
    expect(stored().metadata).toMatchObject({ google_campaign_id: "g-1", google_ad_group_id: "ag-1" });
  });

  it("is an AdlyError the route turns into a 409", async () => {
    seed(composerRow());
    const stale = stored();
    await repo.updateCampaign(h.db.client(OWNER), stale, { name: "x" });
    const err = await repo.updateCampaign(h.db.client(OWNER), stale, { name: "y" }).catch((e) => e);
    expect(err).toBeInstanceOf(AdlyError);
  });
});

describe("M3: archiving a campaign that runs on a network", () => {
  it("refuses while it is live on a network", async () => {
    seed({ ...trackerLiveRow, user_id: OWNER });
    const res = await service.deleteTrackerCampaign(leader, trackerLiveRow.id);
    expect(res).toMatchObject({ ok: false, status: 409 });
    if (!res.ok) expect(res.error).toMatch(/Ads Manager/);
    expect(stored(trackerLiveRow.id).status).toBe("live");
  });

  it("archives a completed one and never shows it as stopped", async () => {
    seed({ ...trackerLiveRow, status: "completed" });
    const res = await service.deleteTrackerCampaign(leader, trackerLiveRow.id);
    expect(res.ok).toBe(true);
    const row = stored(trackerLiveRow.id);
    expect(row.status).toBe("archived");
    const item = rowToAdCampaign(row);
    expect(item.networkMayBeRunning).toBe(true);
    expect(item.statusNote).toMatch(/check the network/i);
    expect(item.platforms.find((p) => p.platform === "x")?.status).not.toBe("ended");
  });

  it("deletes a draft that never reached a network", async () => {
    seed(composerRow());
    const res = await service.deleteTrackerCampaign(leader, DRAFT_ID);
    expect(res).toMatchObject({ ok: true, body: { archived: false } });
    expect(h.db.rows("adly_campaigns")).toHaveLength(0);
  });
});

describe("M5: saving someone else's campaign", () => {
  it("admin gets 403 and no row is inserted", async () => {
    seed(composerRow({ user_id: OTHER }));
    h.userId = ADMIN;
    const res = await service.saveTrackerPlan(admin, { campaign: { ...campaignBody(), id: DRAFT_ID, leaderId: "pf-2" } });
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(h.db.rows("adly_campaigns")).toHaveLength(1);
    expect(h.db.writes.adly_campaigns ?? 0).toBe(0);
  });

  it("a leader asking for an unknown campaign id gets 404, not a new row", async () => {
    seed();
    const res = await service.saveTrackerPlan(leader, { campaign: { ...campaignBody(), id: OTHER } });
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(h.db.rows("adly_campaigns")).toHaveLength(0);
  });
});

describe("L2 / ownership", () => {
  it("refuses publish for a citizen", async () => {
    seed(composerRow({}, true));
    const res = await service.actOnTrackerAd({ ...leaderSession, role: "citizen" }, DRAFT_ID, "publish");
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses when the Siasa session user is not the signed-in Tracker user", async () => {
    seed(composerRow({}, true));
    const res = await service.publishCampaign({ ...leaderSession, userId: OTHER }, DRAFT_ID, {});
    expect(res).toMatchObject({ ok: false, status: 401 });
  });
});

describe("L1: raw errors stay on the server", () => {
  it("answers a generic message for a database error", async () => {
    seed(composerRow({}, true));
    const client = h.db.client(OWNER) as unknown as { from: (t: string) => unknown };
    const from = client.from.bind(client);
    // Make every adly_campaigns read fail with Postgres-looking text.
    h.db = Object.assign(Object.create(Object.getPrototypeOf(h.db)), h.db, {
      client: () => ({
        ...client,
        from: (t: string) =>
          t === "adly_campaigns"
            ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation "adly_campaigns" permission denied' } }) }) }) }
            : from(t),
      }),
    });
    const res = await service.publishCampaign(leaderSession, DRAFT_ID, {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toMatch(/relation|permission denied/);
  });
});
