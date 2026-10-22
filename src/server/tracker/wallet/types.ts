/**
 * Row shapes read from the M-Taji Tracker money tables, and the wallet view
 * Siasa sends to the browser.
 *
 * Kept free of runtime imports so the mapping functions can be unit tested
 * without Next.js or Supabase.
 */

/** public.wallets (one per auth user). numeric columns arrive as number or string. */
export interface TrackerWalletRow {
  id: string;
  user_id?: string;
  balance: number | string;
  currency: string;
  /** Top-ups credited (credit_wallet_from_payment source 'topup' or 'ads'). */
  lifetime_ads: number | string;
  /** Campaign donations credited to the campaign owner. */
  lifetime_crowdfunding: number | string;
  /** Shop order proceeds credited to product authors. */
  lifetime_shop: number | string;
  updated_at?: string;
}

/** public.wallet_transactions. Only Tracker RPCs insert these. */
export interface TrackerWalletTransactionRow {
  id: string;
  wallet_id?: string;
  /** 'topup' | 'ads' | 'crowdfunding' | 'shop' today; open text column. */
  source: string;
  amount: number | string;
  direction: "credit" | "debit" | string;
  /** 'payment' for credits, 'adly_campaign' for ad debits. */
  reference_type: string | null;
  reference_id: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

/** public.withdrawals. Created by request_withdrawal with status 'pending'. */
export interface TrackerWithdrawalRow {
  id: string;
  wallet_id?: string;
  amount: number | string;
  method: string;
  destination: string;
  status: string;
  created_at: string;
}

/** public.payments, the columns Siasa reads. metadata is never selected (it holds Paystack customer data). */
export interface TrackerPaymentRow {
  id: string;
  provider: string;
  provider_reference: string | null;
  payment_type: string;
  amount: number | string;
  currency: string;
  /** 'pending' until the webhook or verify marks it 'complete'. */
  status: string;
  created_at: string;
  updated_at?: string;
}

export type WalletActivityKind =
  | "top-up"
  | "crowdfunding"
  | "shop"
  | "withdrawal"
  | "ad-spend"
  | "ad-refund"
  | "other";

export type WalletActivityStatus = "settled" | "pending" | "completed" | "failed";

export interface WalletActivity {
  id: string;
  kind: WalletActivityKind;
  direction: "in" | "out";
  amount: number;
  status: WalletActivityStatus;
  /** Short description, e.g. the ad network or the withdrawal destination (masked). */
  note?: string;
  /** Linked Tracker record: payment id, adly campaign id, withdrawal id. */
  reference?: string;
  createdAt: string;
}

export type TopUpAttemptState =
  /** Checkout started, Paystack has not confirmed payment yet. */
  | "awaiting-payment"
  /** Paystack confirmed; the wallet credit has not appeared yet. */
  | "processing"
  /** Never paid and old enough that the checkout has lapsed. */
  | "not-completed"
  | "failed";

export interface TopUpAttempt {
  paymentId: string;
  reference: string | null;
  amount: number;
  currency: string;
  state: TopUpAttemptState;
  createdAt: string;
}

/**
 * What the wallet page shows. Replaces the per-source balances of the old
 * WalletRecord: the Tracker keeps one pooled balance, and the lifetime_*
 * columns are inflow totals, not separate pots.
 */
export interface WalletView {
  /** null until the first credit creates the Tracker wallet. */
  walletId: string | null;
  currency: string;
  /** wallets.balance. */
  balance: number;
  /** Sum of withdrawal requests not yet paid out or rejected. request_withdrawal does not deduct them. */
  pendingWithdrawals: number;
  /** balance minus pending withdrawals, never below zero. */
  availableBalance: number;
  /** Lifetime inflows by origin. */
  received: {
    topUps: number;
    crowdfunding: number;
    shop: number;
  };
  lastTopUpAt?: string;
  lastWithdrawalAt?: string;
  /** Newest first: wallet_transactions and withdrawals merged. */
  movements: WalletActivity[];
  /** Top-ups that have not reached the balance yet. */
  pendingTopUps: TopUpAttempt[];
}

/** Paystack verify outcome as reported by verify-paystack-payment. */
export interface TopUpVerification {
  /** Paystack transaction status: success | failed | abandoned | pending | ongoing | reversed ... */
  paystackStatus: string;
  outcome: "credited" | "processing" | "pending" | "failed";
  amount: number;
  reference: string;
}

export const TOP_UP_METHODS = ["M-PESA", "CARD-PAYMENT"] as const;
export type TopUpMethod = (typeof TOP_UP_METHODS)[number];

export const WITHDRAWAL_METHODS = ["mpesa", "bank_transfer"] as const;
export type WithdrawalMethod = (typeof WITHDRAWAL_METHODS)[number];

/** Ad networks debit_wallet_for_ad_spend accepts. */
export const AD_SPEND_PROVIDERS = ["google", "meta", "tiktok", "x"] as const;
export type AdSpendProvider = (typeof AD_SPEND_PROVIDERS)[number];

/** initialize-paystack-payment rejects ads_topup below this. */
export const MIN_TOP_UP_KES = 100;
