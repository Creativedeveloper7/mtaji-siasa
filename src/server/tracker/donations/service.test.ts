import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const FIGURE = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({
  usesTracker: true,
  project: undefined as Record<string, unknown> | undefined,
  leader: undefined as Record<string, unknown> | undefined,
  /** What donation_recipient_owner answers */
  rpc: { data: "owner-1" as unknown, error: null as null | { code?: string; message: string } },
  rpcCalls: [] as Record<string, unknown>[],
  edgeCalls: [] as { slug: string; token: string; body: Record<string, unknown> }[],
  edgeResponse: { ok: true, status: 200, payload: {} as Record<string, unknown> },
}));

vi.mock("@/server", () => ({
  usesTracker: () => h.usesTracker,
  getRepositories: () => ({
    content: {
      findProject: async () => h.project,
      findLeader: async () => h.leader,
    },
  }),
}));

vi.mock("@/server/tracker/clients", () => ({
  anonClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ name, ...args });
      return h.rpc;
    },
  }),
}));

vi.mock("@/server/tracker/wallet/service", () => ({
  callEdgeFunction: async (slug: string, token: string, body: Record<string, unknown>) => {
    h.edgeCalls.push({ slug, token, body });
    return h.edgeResponse;
  },
  isPaystackCheckout: (url: string) => url.startsWith("https://checkout.paystack.com/"),
}));

const { startDonation, verifyProjectDonation } = await import("@/server/tracker/donations/service");

const checkout = { authorization_url: "https://checkout.paystack.com/abc", reference: "ref-123456", recipient_checked: true };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  h.usesTracker = true;
  h.project = { id: PROJECT, name: "Ulinzi Hub", slug: "ulinzi-hub" };
  h.leader = { id: FIGURE, honorific: "Hon.", name: "Amara Njehia", slug: "amara-njehia" };
  h.rpc = { data: "owner-1", error: null };
  h.rpcCalls = [];
  h.edgeCalls = [];
  h.edgeResponse = { ok: true, status: 200, payload: { ...checkout } };
});

describe("startDonation", () => {
  it("sends a project donation straight to the project, no campaign", async () => {
    const res = await startDonation({ projectId: PROJECT, amount: 1000, email: "d@x.co" }, "https://www.m-taji.co.ke");
    expect(res).toEqual({ ok: true, status: 201, data: { checkoutUrl: "https://checkout.paystack.com/abc", reference: "ref-123456" } });
    expect(h.rpcCalls).toEqual([{ name: "donation_recipient_owner", p_project_id: PROJECT, p_figure_id: null }]);
    expect(h.edgeCalls).toHaveLength(1);
    expect(h.edgeCalls[0]).toMatchObject({
      slug: "initialize-paystack-payment",
      token: "anon-key",
      body: {
        amount: 1000,
        payment_type: "donation",
        project_id: PROJECT,
        payer_email: "d@x.co",
        redirect_url: "https://www.m-taji.co.ke/projects/ulinzi-hub?donation=1",
      },
    });
    expect(h.edgeCalls[0].body).not.toHaveProperty("campaign_id");
    expect(h.edgeCalls[0].body).not.toHaveProperty("figure_id");
  });

  it("sends a leader donation straight to the leader", async () => {
    const res = await startDonation({ leaderId: FIGURE, amount: 500 }, "https://www.m-taji.co.ke");
    expect(res.ok).toBe(true);
    expect(h.rpcCalls[0]).toEqual({ name: "donation_recipient_owner", p_project_id: null, p_figure_id: FIGURE });
    expect(h.edgeCalls[0].body).toMatchObject({
      figure_id: FIGURE,
      redirect_url: "https://www.m-taji.co.ke/leaders/amara-njehia?donation=1",
    });
    expect(h.edgeCalls[0].body).not.toHaveProperty("project_id");
    expect(h.edgeCalls[0].body).not.toHaveProperty("campaign_id");
  });

  it("charges nothing when there is no owner to pay", async () => {
    h.rpc = { data: null, error: null };
    expect(await startDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
    expect(h.edgeCalls).toEqual([]);
  });

  it("charges nothing until the Tracker migration is applied", async () => {
    h.rpc = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    expect(await startDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
    expect(h.edgeCalls).toEqual([]);
  });

  it("doesn't send the donor to a checkout an older payment function opened", async () => {
    h.edgeResponse = { ok: true, status: 200, payload: { authorization_url: "https://checkout.paystack.com/abc", reference: "ref-123456" } };
    expect(await startDonation({ leaderId: FIGURE, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
  });

  it("passes on the payment function's own 'not set up' refusal", async () => {
    h.edgeResponse = { ok: false, status: 400, payload: { error: "This page is not set up to receive donations yet." } };
    expect(await startDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses unknown pages, the demo, and a checkout that isn't Paystack's", async () => {
    h.edgeResponse = { ok: true, status: 200, payload: { ...checkout, authorization_url: "https://evil.example/pay" } };
    expect(await startDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 502 });
    h.project = undefined;
    expect(await startDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 404 });
    h.leader = undefined;
    expect(await startDonation({ leaderId: FIGURE, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 404 });
    h.usesTracker = false;
    expect(await startDonation({ projectId: PROJECT, amount: 500 }, "https://x.co")).toMatchObject({ ok: false, status: 503 });
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
