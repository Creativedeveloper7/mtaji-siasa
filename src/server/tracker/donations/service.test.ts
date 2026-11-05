import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  usesTracker: true,
  project: { id: "11111111-1111-4111-8111-111111111111", name: "Kibera water", slug: "kibera-water" } as Record<string, unknown> | undefined,
  owner: "owner-1" as string | undefined,
  campaigns: [] as { id: string; project_id: string; owner_id: string; status: string }[],
  inserted: [] as Record<string, unknown>[],
  serviceRole: true,
  edgeCalls: [] as { slug: string; token: string; body: Record<string, unknown> }[],
  edgeResponse: {
    ok: true,
    status: 200,
    payload: { authorization_url: "https://checkout.paystack.com/abc", reference: "ref-123456" } as Record<string, unknown>,
  },
}));

vi.mock("@/server", () => ({
  usesTracker: () => h.usesTracker,
  getRepositories: () => ({
    content: {
      findProject: async () => h.project,
      projectOwnerUserId: async () => h.owner,
    },
  }),
}));

/** A tiny fundraising_campaigns query that applies the filters the service sends. */
function campaignsTable() {
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    },
    order: () => query,
    limit: async () => ({
      data: h.campaigns.filter((c) => Object.entries(filters).every(([k, v]) => (c as Record<string, unknown>)[k] === v)),
      error: null,
    }),
  };
  return query;
}

vi.mock("@/server/tracker/clients", () => ({
  anonClient: () => ({ from: () => campaignsTable() }),
  hasServiceRole: () => h.serviceRole,
  serviceClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        h.inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "new-campaign" }, error: null }) }) };
      },
    }),
  }),
}));

vi.mock("@/server/tracker/wallet/service", () => ({
  callEdgeFunction: async (slug: string, token: string, body: Record<string, unknown>) => {
    h.edgeCalls.push({ slug, token, body });
    return h.edgeResponse;
  },
  isPaystackCheckout: (url: string) => url.startsWith("https://checkout.paystack.com/"),
}));

const { startProjectDonation, verifyProjectDonation } = await import("@/server/tracker/donations/service");

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  h.usesTracker = true;
  h.project = { id: "11111111-1111-4111-8111-111111111111", name: "Kibera water", slug: "kibera-water" };
  h.owner = "owner-1";
  h.campaigns = [];
  h.inserted = [];
  h.serviceRole = true;
  h.edgeCalls = [];
  h.edgeResponse = {
    ok: true,
    status: 200,
    payload: { authorization_url: "https://checkout.paystack.com/abc", reference: "ref-123456" },
  };
});

const PROJECT = "11111111-1111-4111-8111-111111111111";

describe("startProjectDonation", () => {
  it("pays the project owner's campaign as a guest donation and returns to the project page", async () => {
    h.campaigns = [{ id: "owners-campaign", project_id: PROJECT, owner_id: "owner-1", status: "active" }];
    const res = await startProjectDonation({ projectId: PROJECT, amount: 1000, email: "d@x.co" }, "https://www.m-taji.co.ke");
    expect(res).toEqual({ ok: true, status: 201, data: { checkoutUrl: "https://checkout.paystack.com/abc", reference: "ref-123456" } });
    expect(h.edgeCalls).toHaveLength(1);
    expect(h.edgeCalls[0]).toMatchObject({
      slug: "initialize-paystack-payment",
      token: "anon-key",
      body: {
        amount: 1000,
        payment_type: "donation",
        project_id: PROJECT,
        campaign_id: "owners-campaign",
        payer_email: "d@x.co",
        redirect_url: "https://www.m-taji.co.ke/projects/kibera-water?donation=1",
      },
    });
    expect(h.inserted).toEqual([]);
  });

  it("never uses a campaign someone else created for the project", async () => {
    h.campaigns = [{ id: "someone-elses", project_id: PROJECT, owner_id: "attacker", status: "active" }];
    const res = await startProjectDonation({ projectId: PROJECT, amount: 500 }, "https://www.m-taji.co.ke");
    expect(res.ok).toBe(true);
    expect(h.edgeCalls[0].body.campaign_id).toBe("new-campaign");
    expect(h.inserted).toEqual([{ project_id: PROJECT, owner_id: "owner-1", title: "Kibera water", status: "active" }]);
  });

  it("explains when the project can't take donations", async () => {
    h.serviceRole = false;
    expect(await startProjectDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
    h.serviceRole = true;
    h.owner = undefined;
    expect(await startProjectDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
    h.project = undefined;
    expect(await startProjectDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 404 });
    h.usesTracker = false;
    expect(await startProjectDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
    expect(h.edgeCalls).toEqual([]);
  });

  it("refuses a checkout page that isn't Paystack's", async () => {
    h.campaigns = [{ id: "c", project_id: PROJECT, owner_id: "owner-1", status: "active" }];
    h.edgeResponse = { ok: true, status: 200, payload: { authorization_url: "https://evil.example/pay", reference: "ref-123456" } };
    expect(await startProjectDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 502 });
  });
});

describe("verifyProjectDonation", () => {
  it("confirms a donation through the Tracker's verify function", async () => {
    h.edgeResponse = { ok: true, status: 200, payload: { status: "success", amount: 1000, payment_type: "donation", wallet_credited: true } };
    expect(await verifyProjectDonation({ reference: "ref-123456" })).toEqual({
      ok: true,
      status: 200,
      data: { status: "success", amount: 1000, walletCredited: true },
    });
    expect(h.edgeCalls[0]).toMatchObject({ slug: "verify-paystack-payment", token: "anon-key", body: { reference: "ref-123456" } });
  });

  it("refuses other payment types and bad references", async () => {
    h.edgeResponse = { ok: true, status: 200, payload: { status: "success", payment_type: "ads_topup" } };
    expect(await verifyProjectDonation({ reference: "ref-123456" })).toMatchObject({ ok: false, status: 400 });
    expect(await verifyProjectDonation({ reference: "x" })).toMatchObject({ ok: false, status: 400 });
  });
});
