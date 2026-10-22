import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// service.ts imports the cookie-bound client factory; the tests pass their own client.
vi.mock("@/server/tracker/clients", () => ({ userClient: vi.fn() }));

import {
  debitWalletForAdSpend,
  readTrackerWallet,
  readWalletFunds,
  requestWithdrawal,
  trackerAvailableBalance,
  verifyTopUp,
  VERIFY_RETRY_MESSAGE,
  type SignedIn,
} from "./service";

/* ------------------------------------------------------------------ */
/* A small in-memory stand-in for the PostgREST query builder.          */
/* It really filters, orders and pages rows, so the assertions below    */
/* check what the service computes, not which calls it made.            */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type RpcError = { message: string; code?: string };
type RpcHandler = (args: Row) => { data: unknown; error: RpcError | null };

function fakeClient(tables: Tables, opts: { rpc?: Record<string, RpcHandler>; failTable?: string } = {}) {
  const rpcCalls: { name: string; args: Row }[] = [];

  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let range: [number, number] | null = null;

    const run = () => {
      if (opts.failTable === table) return { data: null, error: { message: "connection reset" } };
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (orderBy) {
        const { col, asc } = orderBy;
        rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (limit != null) rows = rows.slice(0, limit);
      return { data: rows, error: null };
    };

    const builder = {
      select: () => builder,
      eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), builder),
      gte: (col: string, value: string) => (filters.push((r) => String(r[col]) >= value), builder),
      in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), builder),
      not: (col: string, op: string, list: string) => {
        if (op !== "in") throw new Error(`fake: unsupported not.${op}`);
        const values = list.replace(/^\(|\)$/g, "").split(",");
        filters.push((r) => !values.includes(String(r[col])));
        return builder;
      },
      order: (col: string, o?: { ascending?: boolean }) => ((orderBy = { col, asc: o?.ascending ?? true }), builder),
      limit: (n: number) => ((limit = n), builder),
      range: (from: number, to: number) => ((range = [from, to]), builder),
      returns: () => builder,
      maybeSingle: async () => {
        const res = run();
        if (res.error) return res;
        return { data: res.data?.[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  const client = {
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row) => {
      rpcCalls.push({ name, args });
      const handler = opts.rpc?.[name];
      if (!handler) return { data: null, error: { message: `fake: no rpc ${name}`, code: "PGRST202" } };
      return handler(args);
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

const USER_ID = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const WALLET_ID = "6b1f0c1e-2f4a-4d55-9a0b-1c2d3e4f5a6b";
const NOW = new Date("2026-10-22T12:00:00.000Z");

function user(client: SupabaseClient): SignedIn {
  return { client, userId: USER_ID, email: "leader@example.com", accessToken: "token" };
}

function walletRow(balance: number | string) {
  return {
    id: WALLET_ID,
    user_id: USER_ID,
    balance,
    currency: "KES",
    lifetime_ads: 0,
    lifetime_crowdfunding: 0,
    lifetime_shop: 0,
  };
}

let seq = 0;
function withdrawal(status: string, amount: number | string, over: Row = {}): Row {
  seq += 1;
  const n = String(seq).padStart(4, "0");
  return {
    id: `wd-${n}`,
    wallet_id: WALLET_ID,
    amount,
    method: "mpesa",
    destination: "+254700000123",
    status,
    created_at: `2026-10-${String(1 + (seq % 20)).padStart(2, "0")}T10:00:00.000Z`,
    ...over,
  };
}

function payoutDebit(withdrawalId: string, amount: number): Row {
  return {
    id: `tx-${withdrawalId}`,
    wallet_id: WALLET_ID,
    source: "withdrawal",
    amount,
    direction: "debit",
    reference_type: "withdrawal",
    reference_id: withdrawalId,
    metadata: {},
    created_at: "2026-10-21T00:00:00.000Z",
  };
}

describe("held money and available balance", () => {
  it("holds non-final and paid-without-debit withdrawals; releases debited and closed ones", async () => {
    const pending = withdrawal("pending", 1000);
    const approved = withdrawal("approved", "250.50");
    const paidDebited = withdrawal("paid", 400);
    const paidLegacy = withdrawal("paid", 300); // marked paid, no debit row: still in the balance
    const completedDebited = withdrawal("completed", 100);
    const rejected = withdrawal("rejected", 5000);
    const cancelled = withdrawal("cancelled", 70);
    const failed = withdrawal("failed", 80);
    const { client } = fakeClient({
      wallets: [walletRow("4200.00")],
      withdrawals: [pending, approved, paidDebited, paidLegacy, completedDebited, rejected, cancelled, failed],
      wallet_transactions: [
        payoutDebit(String(paidDebited.id), 400),
        payoutDebit(String(completedDebited.id), 100),
        // A credit that happens to reference a withdrawal id does not release it.
        { ...payoutDebit(String(paidLegacy.id), 300), id: "credit-x", direction: "credit" },
      ],
      payments: [],
    });

    const funds = await readWalletFunds(user(client));
    expect(funds).toEqual({
      ok: true,
      status: 200,
      data: { walletId: WALLET_ID, balance: 4200, held: 1550.5, available: 2649.5 },
    });

    const view = await readTrackerWallet(user(client), NOW);
    expect(view.ok && view.data.pendingWithdrawals).toBe(1550.5);
    expect(view.ok && view.data.availableBalance).toBe(2649.5);

    const ads = await trackerAvailableBalance(user(client));
    expect(ads).toEqual({ ok: true, status: 200, data: 2649.5 });
  });

  it("counts every held withdrawal, not only the 20 most recent", async () => {
    const rows = Array.from({ length: 45 }, () => withdrawal("pending", 10));
    const { client } = fakeClient({ wallets: [walletRow(1000)], withdrawals: rows, wallet_transactions: [], payments: [] });
    const view = await readTrackerWallet(user(client), NOW);
    if (!view.ok) throw new Error(view.error);
    expect(view.data.movements.filter((m) => m.kind === "withdrawal")).toHaveLength(20);
    expect(view.data.pendingWithdrawals).toBe(450);
    expect(view.data.availableBalance).toBe(550);
  });

  it("pages past PostgREST's row cap", async () => {
    const rows = Array.from({ length: 1001 }, () => withdrawal("pending", 1));
    const { client } = fakeClient({ wallets: [walletRow(5000)], withdrawals: rows, wallet_transactions: [], payments: [] });
    const funds = await readWalletFunds(user(client));
    expect(funds.ok && funds.data.held).toBe(1001);
  });

  it("is zero with no wallet and 502 when the held read fails", async () => {
    const none = fakeClient({ wallets: [], withdrawals: [], wallet_transactions: [] });
    expect(await trackerAvailableBalance(user(none.client))).toEqual({ ok: true, status: 200, data: 0 });

    const broken = fakeClient({ wallets: [walletRow(100)], withdrawals: [] }, { failTable: "withdrawals" });
    expect(await trackerAvailableBalance(user(broken.client))).toMatchObject({ ok: false, status: 502 });
  });
});

describe("requestWithdrawal", () => {
  const body = { amount: 500, method: "mpesa", destination: "0700000123" };

  it("refuses above the available balance before calling the RPC (409)", async () => {
    const { client, rpcCalls } = fakeClient({
      wallets: [walletRow(1000)],
      withdrawals: [withdrawal("paid", 600)], // paid without debit: held
      wallet_transactions: [],
    });
    const res = await requestWithdrawal(user(client), body);
    expect(res).toMatchObject({ ok: false, status: 409, error: expect.stringMatching(/available balance/) });
    expect(rpcCalls).toHaveLength(0);
  });

  it("passes the parsed amount and returns the new withdrawal id", async () => {
    const { client, rpcCalls } = fakeClient(
      { wallets: [walletRow(1000)], withdrawals: [], wallet_transactions: [] },
      { rpc: { request_withdrawal: () => ({ data: "wd-new", error: null }) } }
    );
    const res = await requestWithdrawal(user(client), { ...body, amount: "128.02" });
    expect(res).toEqual({ ok: true, status: 201, data: { withdrawalId: "wd-new" } });
    expect(rpcCalls[0].args).toMatchObject({ p_wallet_id: WALLET_ID, p_amount: 128.02, p_method: "mpesa" });
  });

  it("maps the RPC's authoritative balance check to 409 even when the pre-check passed", async () => {
    const { client } = fakeClient(
      { wallets: [walletRow(1000)], withdrawals: [], wallet_transactions: [] },
      { rpc: { request_withdrawal: () => ({ data: null, error: { message: "amount exceeds available balance", code: "P0001" } }) } }
    );
    const res = await requestWithdrawal(user(client), body);
    expect(res).toEqual({
      ok: false,
      status: 409,
      error: "Amount exceeds your available balance. Money held for pending withdrawals counts against it.",
    });
  });

  it("maps business errors to 400 and network/server errors to 502", async () => {
    const run = async (error: RpcError) => {
      const { client } = fakeClient(
        { wallets: [walletRow(1000)], withdrawals: [], wallet_transactions: [] },
        { rpc: { request_withdrawal: () => ({ data: null, error }) } }
      );
      return requestWithdrawal(user(client), body);
    };
    expect(await run({ message: "destination required", code: "P0001" })).toMatchObject({ status: 400 });
    expect(await run({ message: "TypeError: fetch failed", code: "" })).toMatchObject({ status: 502 });
    expect(await run({ message: "canceling statement due to statement timeout", code: "57014" })).toMatchObject({
      status: 502,
    });
  });

  it("rejects malformed amounts with 400 without reading the wallet", async () => {
    const { client, rpcCalls } = fakeClient({ wallets: [walletRow(1000)] }, { failTable: "wallets" });
    expect(await requestWithdrawal(user(client), { ...body, amount: "1e3" })).toMatchObject({ ok: false, status: 400 });
    expect(await requestWithdrawal(user(client), { ...body, amount: "0x64" })).toMatchObject({ ok: false, status: 400 });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("ad debits", () => {
  it("maps the Tracker's available-balance refusal to 402 and outages to 502", async () => {
    const run = async (error: RpcError) => {
      const { client } = fakeClient({}, { rpc: { debit_wallet_for_ad_spend: () => ({ data: null, error }) } });
      return debitWalletForAdSpend(user(client), { campaignId: "c1", provider: "meta", amountKes: 100 });
    };
    expect(await run({ message: "amount exceeds available balance", code: "P0001" })).toMatchObject({ status: 402 });
    expect(await run({ message: "insufficient wallet balance", code: "P0001" })).toMatchObject({ status: 402 });
    expect(await run({ message: "fetch failed" })).toMatchObject({ status: 502 });
  });
});

describe("verifyTopUp", () => {
  const REF = "8f14e45f-ceea-467a-9575-c2c6a4f9e1b0";
  const paymentRow = (minutesAgo: number) => ({
    id: "pay-1",
    user_id: USER_ID,
    provider: "paystack",
    provider_reference: REF,
    payment_type: "ads_topup",
    status: "pending",
    created_at: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubEdge(status: number, payload: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }))
    );
  }

  it("returns 502 retry, not 'pending', when the edge function fails", async () => {
    const { client } = fakeClient({ payments: [paymentRow(5)] });
    stubEdge(500, { error: "Internal error" });
    expect(await verifyTopUp(user(client), REF, NOW)).toEqual({ ok: false, status: 502, error: VERIFY_RETRY_MESSAGE });
    stubEdge(503, {});
    expect(await verifyTopUp(user(client), REF, NOW)).toMatchObject({ ok: false, status: 502 });
  });

  it("returns 502 on a network error or timeout", async () => {
    const { client } = fakeClient({ payments: [paymentRow(5)] });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    expect(await verifyTopUp(user(client), REF, NOW)).toMatchObject({ ok: false, status: 502 });
  });

  it("keeps 401 as an expired session", async () => {
    const { client } = fakeClient({ payments: [paymentRow(5)] });
    stubEdge(401, { error: "Unauthorized" });
    expect(await verifyTopUp(user(client), REF, NOW)).toMatchObject({ ok: false, status: 401 });
  });

  it("reports an unpaid checkout Paystack does not know yet as pending", async () => {
    const { client } = fakeClient({ payments: [paymentRow(5)] });
    stubEdge(404, { error: "Transaction reference not found" });
    expect(await verifyTopUp(user(client), REF, NOW)).toMatchObject({ ok: true, data: { outcome: "pending" } });
  });

  it("treats 'abandoned' as pending within 30 minutes and failed after", async () => {
    stubEdge(200, { status: "abandoned", amount: 0, reference: REF });
    const fresh = fakeClient({ payments: [paymentRow(10)] });
    expect(await verifyTopUp(user(fresh.client), REF, NOW)).toMatchObject({ ok: true, data: { outcome: "pending" } });
    const stale = fakeClient({ payments: [paymentRow(45)] });
    expect(await verifyTopUp(user(stale.client), REF, NOW)).toMatchObject({ ok: true, data: { outcome: "failed" } });
  });

  it("reads a credited top-up", async () => {
    stubEdge(200, { status: "success", amount: 2000, reference: REF, wallet_credited: true });
    const { client } = fakeClient({ payments: [paymentRow(2)] });
    expect(await verifyTopUp(user(client), REF, NOW)).toEqual({
      ok: true,
      status: 200,
      data: { paystackStatus: "success", outcome: "credited", amount: 2000, reference: REF },
    });
  });
});
