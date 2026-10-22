/**
 * Pure mapping between Tracker money rows and Siasa's wallet view.
 * No I/O here: the service reads rows, these functions shape them.
 */
import {
  MIN_TOP_UP_KES,
  TOP_UP_METHODS,
  WITHDRAWAL_METHODS,
  type TopUpAttempt,
  type TopUpMethod,
  type TopUpVerification,
  type TrackerPaymentRow,
  type TrackerWalletRow,
  type TrackerWalletTransactionRow,
  type TrackerWithdrawalRow,
  type WalletActivity,
  type WalletActivityStatus,
  type WalletView,
  type WithdrawalMethod,
} from "./types";

/** A pending checkout older than this is shown as not completed. */
export const CHECKOUT_LAPSE_MS = 24 * 60 * 60 * 1000;
/** Unfinished top-ups older than this are no longer listed. */
export const ATTEMPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** numeric columns come back from PostgREST as number or string. */
export function toAmount(value: unknown): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  meta: "Meta",
  tiktok: "TikTok",
  x: "X",
};

export function mapTransaction(row: TrackerWalletTransactionRow): WalletActivity {
  const credit = row.direction === "credit";
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const provider = typeof meta.provider === "string" ? meta.provider : undefined;
  const providerLabel = provider ? PROVIDER_LABELS[provider] ?? provider : undefined;
  const base = {
    id: row.id,
    direction: credit ? ("in" as const) : ("out" as const),
    amount: toAmount(row.amount),
    status: "settled" as const,
    reference: row.reference_id ?? undefined,
    createdAt: row.created_at,
  };

  if (row.source === "ads" && row.reference_type === "adly_campaign") {
    if (credit) {
      return { ...base, kind: "ad-refund", note: providerLabel ? `${providerLabel} ad refund` : "Ad refund" };
    }
    const increase = meta.kind === "budget_increase";
    const label = providerLabel ? `${providerLabel} ads` : "Ads";
    return { ...base, kind: "ad-spend", note: increase ? `${label} · budget increase` : label };
  }
  if (credit && (row.source === "topup" || row.source === "ads")) {
    return { ...base, kind: "top-up", note: "Paystack top-up" };
  }
  if (credit && row.source === "crowdfunding") {
    return { ...base, kind: "crowdfunding", note: "Campaign donation" };
  }
  if (credit && row.source === "shop") {
    return { ...base, kind: "shop", note: "Merchandise sale" };
  }
  return { ...base, kind: "other", note: row.source || undefined };
}

export function withdrawalStatus(status: string): WalletActivityStatus {
  const s = status.trim().toLowerCase();
  if (["paid", "completed", "complete", "success", "succeeded", "processed"].includes(s)) return "completed";
  if (["rejected", "failed", "cancelled", "canceled", "declined", "reversed"].includes(s)) return "failed";
  // pending, processing, approved and anything new: money may still leave.
  return "pending";
}

/** Show only the last four characters of a phone number or account. */
export function maskDestination(destination: string): string {
  const clean = destination.replace(/\s+/g, "");
  if (clean.length <= 4) return "••••";
  return `•••• ${clean.slice(-4)}`;
}

const WITHDRAWAL_METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  bank_transfer: "Bank transfer",
};

export function mapWithdrawal(row: TrackerWithdrawalRow): WalletActivity {
  const method = WITHDRAWAL_METHOD_LABELS[row.method] ?? row.method;
  return {
    id: row.id,
    kind: "withdrawal",
    direction: "out",
    amount: toAmount(row.amount),
    status: withdrawalStatus(row.status),
    note: `${method} ${maskDestination(row.destination)}`,
    reference: row.id,
    createdAt: row.created_at,
  };
}

/**
 * Top-ups that have not reached the balance yet.
 * @param creditedPaymentIds payment ids that already have a wallet credit
 */
export function mapTopUpAttempts(
  payments: readonly TrackerPaymentRow[],
  creditedPaymentIds: ReadonlySet<string>,
  now: Date
): TopUpAttempt[] {
  const attempts: TopUpAttempt[] = [];
  for (const p of payments) {
    if (p.payment_type !== "ads_topup") continue;
    if (creditedPaymentIds.has(p.id)) continue;
    const age = now.getTime() - new Date(p.created_at).getTime();
    if (age > ATTEMPT_WINDOW_MS) continue;
    const status = p.status.trim().toLowerCase();
    let state: TopUpAttempt["state"];
    if (status === "complete" || status === "success") state = "processing";
    else if (status === "pending") state = age > CHECKOUT_LAPSE_MS ? "not-completed" : "awaiting-payment";
    else state = "failed";
    attempts.push({
      paymentId: p.id,
      reference: p.provider_reference,
      amount: toAmount(p.amount),
      currency: p.currency || "KES",
      state,
      createdAt: p.created_at,
    });
  }
  return attempts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function byNewest(a: WalletActivity, b: WalletActivity) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function buildWalletView(input: {
  wallet: TrackerWalletRow | null;
  transactions: readonly TrackerWalletTransactionRow[];
  withdrawals: readonly TrackerWithdrawalRow[];
  payments: readonly TrackerPaymentRow[];
  creditedPaymentIds: ReadonlySet<string>;
  now: Date;
}): WalletView {
  const { wallet } = input;
  const transactionMoves = input.transactions.map(mapTransaction);
  const withdrawalMoves = input.withdrawals.map(mapWithdrawal);
  const movements = [...transactionMoves, ...withdrawalMoves].sort(byNewest);

  const balance = wallet ? toAmount(wallet.balance) : 0;
  const pendingWithdrawals = toAmount(
    withdrawalMoves.filter((m) => m.status === "pending").reduce((sum, m) => sum + m.amount, 0)
  );
  const lastTopUp = transactionMoves.filter((m) => m.kind === "top-up").sort(byNewest)[0];
  const lastWithdrawal = [...withdrawalMoves].sort(byNewest)[0];

  return {
    walletId: wallet?.id ?? null,
    currency: wallet?.currency || "KES",
    balance,
    pendingWithdrawals,
    availableBalance: Math.max(0, toAmount(balance - pendingWithdrawals)),
    received: {
      topUps: wallet ? toAmount(wallet.lifetime_ads) : 0,
      crowdfunding: wallet ? toAmount(wallet.lifetime_crowdfunding) : 0,
      shop: wallet ? toAmount(wallet.lifetime_shop) : 0,
    },
    lastTopUpAt: lastTopUp?.createdAt,
    lastWithdrawalAt: lastWithdrawal?.createdAt,
    movements,
    pendingTopUps: mapTopUpAttempts(input.payments, input.creditedPaymentIds, input.now),
  };
}

/** Read the verify-paystack-payment response body. */
export function interpretVerification(payload: unknown, reference: string): TopUpVerification {
  const body = (payload ?? {}) as Record<string, unknown>;
  const paystackStatus = typeof body.status === "string" ? body.status.toLowerCase() : "unknown";
  const settle = (body.settle ?? null) as Record<string, unknown> | null;
  const credited = body.wallet_credited === true || (settle?.ok === true && settle.already_credited === true);
  let outcome: TopUpVerification["outcome"];
  if (paystackStatus === "success") outcome = credited ? "credited" : "processing";
  else if (["pending", "ongoing", "processing", "queued"].includes(paystackStatus)) outcome = "pending";
  else outcome = "failed";
  return {
    paystackStatus,
    outcome,
    amount: toAmount(body.amount),
    reference: typeof body.reference === "string" && body.reference ? body.reference : reference,
  };
}

/** Translate Tracker RPC exceptions into messages a politician can act on. */
export function walletErrorMessage(raw: string | undefined | null): string {
  const message = (raw ?? "").toLowerCase();
  if (message.includes("insufficient wallet balance")) return "Your wallet balance is too low for this. Top up first.";
  if (message.includes("exceeds available balance")) return "Amount exceeds your available balance.";
  if (message.includes("wallet not found")) return "Your wallet has no funds yet. Top up first.";
  if (message.includes("not authenticated")) return "Your session has expired. Sign in again.";
  if (message.includes("campaign not found")) return "That ad campaign is not linked to your account.";
  if (message.includes("invalid provider")) return "That ad network is not supported for wallet payments.";
  if (message.includes("destination required")) return "Enter where the money should be sent.";
  if (message.includes("method required")) return "Choose how you want to be paid.";
  if (message.includes("invalid withdrawal amount") || message.includes("amount must be")) return "Enter a valid amount.";
  if (message.includes("minimum ads top-up")) return `The minimum top-up is KES ${MIN_TOP_UP_KES}.`;
  return "The payment service could not complete this. Try again shortly.";
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseTopUpInput(
  input: { amount?: unknown; method?: unknown }
): { ok: true; amount: number; method: TopUpMethod } | { ok: false; error: string } {
  const amount = asNumber(input.amount);
  if (amount == null || amount <= 0) return { ok: false, error: "Enter a valid top-up amount." };
  if (amount < MIN_TOP_UP_KES) return { ok: false, error: `The minimum top-up is KES ${MIN_TOP_UP_KES}.` };
  if (Math.round(amount * 100) !== amount * 100) return { ok: false, error: "Use at most two decimal places." };
  if (amount > 1_000_000) return { ok: false, error: "Top up at most KES 1,000,000 at a time." };
  const method = input.method === undefined ? "M-PESA" : input.method;
  if (typeof method !== "string" || !TOP_UP_METHODS.includes(method as TopUpMethod)) {
    return { ok: false, error: "Choose how you want to pay." };
  }
  return { ok: true, amount, method: method as TopUpMethod };
}

export function parseWithdrawalInput(input: {
  amount?: unknown;
  method?: unknown;
  destination?: unknown;
}):
  | { ok: true; amount: number; method: WithdrawalMethod; destination: string }
  | { ok: false; error: string } {
  const amount = asNumber(input.amount);
  if (amount == null || amount <= 0) return { ok: false, error: "Enter a valid withdrawal amount." };
  if (Math.round(amount * 100) !== amount * 100) return { ok: false, error: "Use at most two decimal places." };
  if (typeof input.method !== "string" || !WITHDRAWAL_METHODS.includes(input.method as WithdrawalMethod)) {
    return { ok: false, error: "Choose how you want to be paid." };
  }
  const destination = typeof input.destination === "string" ? input.destination.trim() : "";
  if (!destination) return { ok: false, error: "Enter where the money should be sent." };
  if (destination.length > 120) return { ok: false, error: "Destination is too long." };
  if (input.method === "mpesa" && !/^\+?\d{9,13}$/.test(destination.replace(/[\s-]/g, ""))) {
    return { ok: false, error: "Enter a valid M-Pesa phone number." };
  }
  return { ok: true, amount, method: input.method as WithdrawalMethod, destination };
}

/** Paystack appends ?trxref=&reference= to the callback URL. */
export function readReturnReference(params: URLSearchParams): string | null {
  const ref = params.get("reference") || params.get("trxref");
  if (!ref) return null;
  const trimmed = ref.trim();
  return /^[A-Za-z0-9_.=-]{6,100}$/.test(trimmed) ? trimmed : null;
}
