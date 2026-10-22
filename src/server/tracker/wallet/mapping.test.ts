import { describe, expect, it } from "vitest";
import {
  buildWalletView,
  interpretVerification,
  mapTopUpAttempts,
  mapTransaction,
  mapWithdrawal,
  maskDestination,
  parseTopUpInput,
  parseWithdrawalInput,
  readReturnReference,
  toAmount,
  walletErrorMessage,
  withdrawalStatus,
} from "./mapping";
import type {
  TrackerPaymentRow,
  TrackerWalletRow,
  TrackerWalletTransactionRow,
  TrackerWithdrawalRow,
} from "./types";

// Fixtures follow the live Tracker columns (wallets, wallet_transactions,
// withdrawals, payments) and the values the RPCs write. Ids and amounts are made up.
const WALLET_ID = "6b1f0c1e-2f4a-4d55-9a0b-1c2d3e4f5a6b";
const CAMPAIGN_ID = "0a7c9e11-5b3d-4f2e-8c1a-9d8e7f6a5b4c";
const PAYMENT_A = "c3d4e5f6-0718-4293-a4b5-c6d7e8f90a1b";
const PAYMENT_B = "d4e5f607-1829-43a4-b5c6-d7e8f90a1b2c";
const PAYMENT_C = "e5f60718-293a-44b5-c6d7-e8f90a1b2c3d";
const NOW = new Date("2026-10-22T12:00:00.000Z");

const wallet: TrackerWalletRow = {
  id: WALLET_ID,
  balance: "4200.00",
  currency: "KES",
  lifetime_ads: 6000,
  lifetime_crowdfunding: "750.50",
  lifetime_shop: 0,
  updated_at: "2026-10-21T08:00:00.000Z",
};

const topUpCredit: TrackerWalletTransactionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  wallet_id: WALLET_ID,
  source: "topup",
  amount: 5000,
  direction: "credit",
  reference_type: "payment",
  reference_id: PAYMENT_A,
  metadata: {},
  created_at: "2026-10-20T09:00:00.000Z",
};
const donationCredit: TrackerWalletTransactionRow = {
  id: "22222222-2222-4222-8222-222222222222",
  wallet_id: WALLET_ID,
  source: "crowdfunding",
  amount: "750.50",
  direction: "credit",
  reference_type: "payment",
  reference_id: "f6071829-3a4b-45c6-d7e8-f90a1b2c3d4e",
  metadata: {},
  created_at: "2026-10-19T09:00:00.000Z",
};
const adDebit: TrackerWalletTransactionRow = {
  id: "33333333-3333-4333-8333-333333333333",
  wallet_id: WALLET_ID,
  source: "ads",
  amount: 1500,
  direction: "debit",
  reference_type: "adly_campaign",
  reference_id: CAMPAIGN_ID,
  metadata: { provider: "meta", ref: `${CAMPAIGN_ID}:meta` },
  created_at: "2026-10-21T07:30:00.000Z",
};
const adIncrease: TrackerWalletTransactionRow = {
  ...adDebit,
  id: "44444444-4444-4444-8444-444444444444",
  amount: 50.5,
  metadata: { provider: "tiktok", kind: "budget_increase" },
  created_at: "2026-10-21T07:45:00.000Z",
};
const legacyAdsCredit: TrackerWalletTransactionRow = {
  ...topUpCredit,
  id: "55555555-5555-4555-8555-555555555555",
  source: "ads",
};

const pendingWithdrawal: TrackerWithdrawalRow = {
  id: "66666666-6666-4666-8666-666666666666",
  wallet_id: WALLET_ID,
  amount: "1000",
  method: "mpesa",
  destination: "+254700000123",
  status: "pending",
  created_at: "2026-10-21T10:00:00.000Z",
};
const paidWithdrawal: TrackerWithdrawalRow = {
  ...pendingWithdrawal,
  id: "77777777-7777-4777-8777-777777777777",
  amount: 300,
  method: "bank_transfer",
  destination: "Acct 0123456789",
  status: "paid",
  created_at: "2026-10-18T10:00:00.000Z",
};

function payment(over: Partial<TrackerPaymentRow>): TrackerPaymentRow {
  return {
    id: PAYMENT_B,
    provider: "paystack",
    provider_reference: "8f14e45f-ceea-467a-9575-c2c6a4f9e1b0",
    payment_type: "ads_topup",
    amount: 2000,
    currency: "KES",
    status: "pending",
    created_at: "2026-10-22T11:30:00.000Z",
    updated_at: "2026-10-22T11:30:00.000Z",
    ...over,
  };
}

describe("toAmount", () => {
  it("reads numeric columns given as number or string", () => {
    expect(toAmount("4200.00")).toBe(4200);
    expect(toAmount(750.505)).toBe(750.51);
    expect(toAmount(null)).toBe(0);
    expect(toAmount("abc")).toBe(0);
  });
});

describe("mapTransaction", () => {
  it("maps a Paystack top-up credit", () => {
    expect(mapTransaction(topUpCredit)).toEqual({
      id: topUpCredit.id,
      kind: "top-up",
      direction: "in",
      amount: 5000,
      status: "settled",
      note: "Paystack top-up",
      reference: PAYMENT_A,
      createdAt: topUpCredit.created_at,
    });
  });

  it("treats a legacy 'ads' payment credit as a top-up", () => {
    expect(mapTransaction(legacyAdsCredit).kind).toBe("top-up");
  });

  it("maps donations and shop credits", () => {
    expect(mapTransaction(donationCredit)).toMatchObject({ kind: "crowdfunding", direction: "in", amount: 750.5 });
    expect(mapTransaction({ ...donationCredit, source: "shop" })).toMatchObject({ kind: "shop", note: "Merchandise sale" });
  });

  it("maps ad debits with their network", () => {
    expect(mapTransaction(adDebit)).toMatchObject({
      kind: "ad-spend",
      direction: "out",
      amount: 1500,
      note: "Meta ads",
      reference: CAMPAIGN_ID,
    });
    expect(mapTransaction(adIncrease).note).toBe("TikTok ads · budget increase");
  });

  it("keeps unknown sources visible as 'other'", () => {
    expect(mapTransaction({ ...topUpCredit, source: "subscription", direction: "debit" })).toMatchObject({
      kind: "other",
      direction: "out",
      note: "subscription",
    });
  });
});

describe("withdrawals", () => {
  it("maps statuses conservatively", () => {
    expect(withdrawalStatus("pending")).toBe("pending");
    expect(withdrawalStatus("approved")).toBe("pending");
    expect(withdrawalStatus("something_new")).toBe("pending");
    expect(withdrawalStatus("paid")).toBe("completed");
    expect(withdrawalStatus("Rejected")).toBe("failed");
  });

  it("masks the destination", () => {
    expect(maskDestination("+254700000123")).toBe("•••• 0123");
    expect(maskDestination("123")).toBe("••••");
    expect(mapWithdrawal(pendingWithdrawal)).toMatchObject({
      kind: "withdrawal",
      direction: "out",
      amount: 1000,
      status: "pending",
      note: "M-Pesa •••• 0123",
    });
    expect(mapWithdrawal(paidWithdrawal).note).toBe("Bank transfer •••• 6789");
  });
});

describe("mapTopUpAttempts", () => {
  it("lists only unfinished ads_topup payments from the last week", () => {
    const attempts = mapTopUpAttempts(
      [
        payment({ id: PAYMENT_A, status: "complete" }), // credited below
        payment({ id: PAYMENT_B }), // 30 minutes old, pending
        payment({ id: PAYMENT_C, status: "complete", created_at: "2026-10-22T11:00:00.000Z" }),
        payment({ id: "old-pending", created_at: "2026-10-20T11:00:00.000Z" }),
        payment({ id: "ancient", created_at: "2026-10-01T11:00:00.000Z" }),
        payment({ id: "donation", payment_type: "donation" }),
        payment({ id: "failed", status: "failed", created_at: "2026-10-21T11:00:00.000Z" }),
      ],
      new Set([PAYMENT_A]),
      NOW
    );
    expect(attempts.map((a) => [a.paymentId, a.state])).toEqual([
      [PAYMENT_B, "awaiting-payment"],
      [PAYMENT_C, "processing"],
      ["failed", "failed"],
      ["old-pending", "not-completed"],
    ]);
  });
});

describe("buildWalletView", () => {
  it("builds an honest view from Tracker rows", () => {
    const view = buildWalletView({
      wallet,
      transactions: [adIncrease, adDebit, topUpCredit, donationCredit],
      withdrawals: [pendingWithdrawal, paidWithdrawal],
      payments: [payment({ id: PAYMENT_A, status: "complete" }), payment({ id: PAYMENT_B })],
      creditedPaymentIds: new Set([PAYMENT_A]),
      now: NOW,
    });
    expect(view).toMatchObject({
      walletId: WALLET_ID,
      currency: "KES",
      balance: 4200,
      pendingWithdrawals: 1000,
      availableBalance: 3200,
      received: { topUps: 6000, crowdfunding: 750.5, shop: 0 },
      lastTopUpAt: topUpCredit.created_at,
      lastWithdrawalAt: pendingWithdrawal.created_at,
    });
    expect(view.movements.map((m) => m.id)).toEqual([
      pendingWithdrawal.id,
      adIncrease.id,
      adDebit.id,
      topUpCredit.id,
      donationCredit.id,
      paidWithdrawal.id,
    ]);
    expect(view.pendingTopUps).toHaveLength(1);
    expect(view.pendingTopUps[0]).toMatchObject({ paymentId: PAYMENT_B, amount: 2000, state: "awaiting-payment" });
  });

  it("shows zeros, not demo balances, before the first credit", () => {
    const view = buildWalletView({
      wallet: null,
      transactions: [],
      withdrawals: [],
      payments: [payment({})],
      creditedPaymentIds: new Set(),
      now: NOW,
    });
    expect(view).toMatchObject({
      walletId: null,
      balance: 0,
      availableBalance: 0,
      pendingWithdrawals: 0,
      received: { topUps: 0, crowdfunding: 0, shop: 0 },
      movements: [],
    });
    expect(view.pendingTopUps[0].state).toBe("awaiting-payment");
  });

  it("never reports a negative available balance", () => {
    const view = buildWalletView({
      wallet: { ...wallet, balance: 500 },
      transactions: [],
      withdrawals: [pendingWithdrawal],
      payments: [],
      creditedPaymentIds: new Set(),
      now: NOW,
    });
    expect(view.availableBalance).toBe(0);
  });
});

describe("interpretVerification", () => {
  const ref = "8f14e45f-ceea-467a-9575-c2c6a4f9e1b0";
  it("reads a credited top-up", () => {
    expect(
      interpretVerification(
        { status: "success", amount: 2000, reference: ref, payment_type: "ads_topup", wallet_credited: true, settle: { ok: true, credited: 2000, beneficiaries: 1 } },
        ref
      )
    ).toEqual({ paystackStatus: "success", outcome: "credited", amount: 2000, reference: ref });
  });
  it("treats an already-credited payment as credited", () => {
    expect(
      interpretVerification({ status: "success", amount: 2000, wallet_credited: false, settle: { ok: true, already_credited: true, credited: 0 } }, ref).outcome
    ).toBe("credited");
  });
  it("reports paid-but-not-settled as processing", () => {
    expect(interpretVerification({ status: "success", amount: 2000, wallet_credited: false, settle: { ok: false, error: "topup_requires_user" } }, ref).outcome).toBe("processing");
  });
  it("reports pending and failed Paystack states", () => {
    expect(interpretVerification({ status: "ongoing" }, ref).outcome).toBe("pending");
    expect(interpretVerification({ status: "abandoned", amount: 0 }, ref)).toMatchObject({ outcome: "failed", reference: ref });
    expect(interpretVerification(null, ref).outcome).toBe("failed");
  });
});

describe("walletErrorMessage", () => {
  it("translates RPC exceptions", () => {
    expect(walletErrorMessage("insufficient wallet balance")).toMatch(/too low/);
    expect(walletErrorMessage("amount exceeds available balance")).toMatch(/exceeds/);
    expect(walletErrorMessage("Minimum ads top-up is KES 100")).toMatch(/KES 100/);
    expect(walletErrorMessage("connection reset")).toMatch(/could not complete/);
  });
});

describe("input parsing", () => {
  it("validates top-ups", () => {
    expect(parseTopUpInput({ amount: 500 })).toEqual({ ok: true, amount: 500, method: "M-PESA" });
    expect(parseTopUpInput({ amount: "1500", method: "CARD-PAYMENT" })).toEqual({ ok: true, amount: 1500, method: "CARD-PAYMENT" });
    expect(parseTopUpInput({ amount: 50 }).ok).toBe(false);
    expect(parseTopUpInput({ amount: 100.123 }).ok).toBe(false);
    expect(parseTopUpInput({ amount: 500, method: "bitcoin" }).ok).toBe(false);
  });

  it("validates withdrawals", () => {
    expect(parseWithdrawalInput({ amount: 1000, method: "mpesa", destination: " 0700 000 123 " })).toEqual({
      ok: true,
      amount: 1000,
      method: "mpesa",
      destination: "0700 000 123",
    });
    expect(parseWithdrawalInput({ amount: 1000, method: "mpesa", destination: "not a phone" }).ok).toBe(false);
    expect(parseWithdrawalInput({ amount: 1000, method: "bank_transfer", destination: "" }).ok).toBe(false);
    expect(parseWithdrawalInput({ amount: -5, method: "mpesa", destination: "0700000123" }).ok).toBe(false);
    expect(parseWithdrawalInput({ amount: 5, method: "cash", destination: "0700000123" }).ok).toBe(false);
  });

  it("reads the Paystack return reference", () => {
    expect(readReturnReference(new URLSearchParams("topup=1&trxref=abc123def&reference=abc123def"))).toBe("abc123def");
    expect(readReturnReference(new URLSearchParams("topup=1"))).toBeNull();
    expect(readReturnReference(new URLSearchParams("reference=<script>"))).toBeNull();
  });
});
