import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userClient } from "@/server/tracker/clients";
import {
  availableBalance,
  buildWalletView,
  classifyWalletRpcError,
  heldWithdrawalAmount,
  interpretVerification,
  parseTopUpInput,
  parseWithdrawalInput,
  toAmount,
  walletErrorMessage,
  ATTEMPT_WINDOW_MS,
  AVAILABLE_BALANCE_MESSAGE,
  WITHDRAWAL_CLOSED_STATUSES,
} from "./mapping";
import {
  AD_SPEND_PROVIDERS,
  type AdSpendProvider,
  type TopUpVerification,
  type TrackerPaymentRow,
  type TrackerWalletRow,
  type TrackerWalletTransactionRow,
  type TrackerWithdrawalRow,
  type WalletView,
} from "./types";

/**
 * The politician wallet on the M-Taji Tracker backend.
 *
 * Money rules (docs/tracker-backend.md, "Money"):
 * - Siasa never writes wallets or wallet_transactions. Every read goes through
 *   the user's own session, so row-level security limits it to their wallet.
 * - The balance changes only through Tracker RPCs (request_withdrawal,
 *   debit_wallet_for_ad_spend*) and the Paystack webhook / verify function,
 *   which call settle_payment_to_wallets.
 * - Top-ups start in the initialize-paystack-payment edge function, called
 *   with the user's own access token so the payment is attached to them.
 */

export type WalletResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

function fail<T>(status: number, error: string): WalletResult<T> {
  return { ok: false, status, error };
}

const EDGE_TIMEOUT_MS = 20_000;
const TX_LIMIT = 50;
const WITHDRAWAL_LIMIT = 20;
const PAYMENT_LIMIT = 20;
/** Page size for the unlimited held-withdrawal reads (PostgREST caps a response at max_rows). */
const PAGE_SIZE = 1000;

const WALLET_COLUMNS = "id, balance, currency, lifetime_ads, lifetime_crowdfunding, lifetime_shop, updated_at";
const TX_COLUMNS = "id, source, amount, direction, reference_type, reference_id, metadata, created_at";
const WITHDRAWAL_COLUMNS = "id, amount, method, destination, status, created_at";
/** payments.metadata is left out on purpose: it holds the raw Paystack payload, customer details included. */
const PAYMENT_COLUMNS = "id, provider, provider_reference, payment_type, amount, currency, status, created_at, updated_at";

export interface SignedIn {
  client: SupabaseClient;
  userId: string;
  email?: string;
  accessToken: string;
}

/**
 * The signed-in Tracker user. The user is confirmed with auth.getUser()
 * (a round trip to Supabase Auth), never from the cookie alone.
 * @param expectedUserId the Siasa session's user id; must match.
 */
export async function signedInWalletUser(expectedUserId?: string): Promise<WalletResult<SignedIn>> {
  const client = await userClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return fail(401, "Sign in required.");
  if (expectedUserId && expectedUserId !== user.id) return fail(401, "Sign in required.");
  const { data: sessionData } = await client.auth.getSession();
  const session = sessionData?.session;
  if (!session?.access_token || session.user?.id !== user.id) return fail(401, "Sign in required.");
  return {
    ok: true,
    status: 200,
    data: { client, userId: user.id, email: user.email ?? undefined, accessToken: session.access_token },
  };
}

async function readWalletRow(client: SupabaseClient, userId: string) {
  return client
    .from("wallets")
    .select(WALLET_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle<TrackerWalletRow>();
}

type HeldCandidate = Pick<TrackerWithdrawalRow, "id" | "status" | "amount">;

/** Read every page of a query; `page(from, to)` must apply a stable order and .range(from, to). */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

/**
 * Everything needed to work out held money, with no recency limit:
 * - every withdrawal not rejected/failed/cancelled (not-final ones are held;
 *   paid/completed ones are held until their debit row exists);
 * - the ids of withdrawals complete_withdrawal has debited.
 */
async function readHeldInputs(
  client: SupabaseClient,
  walletId: string
): Promise<{ ok: true; candidates: HeldCandidate[]; debitedIds: Set<string> } | { ok: false }> {
  const [candidatesRes, debitsRes] = await Promise.all([
    readAllPages<HeldCandidate>((from, to) =>
      client
        .from("withdrawals")
        .select("id, status, amount")
        .eq("wallet_id", walletId)
        .not("status", "in", `(${WITHDRAWAL_CLOSED_STATUSES.join(",")})`)
        .order("id", { ascending: true })
        .range(from, to)
        .returns<HeldCandidate[]>()
    ),
    readAllPages<{ reference_id: string | null }>((from, to) =>
      client
        .from("wallet_transactions")
        .select("reference_id")
        .eq("wallet_id", walletId)
        .eq("direction", "debit")
        .eq("reference_type", "withdrawal")
        .order("id", { ascending: true })
        .range(from, to)
        .returns<{ reference_id: string | null }[]>()
    ),
  ]);
  if (candidatesRes.error || debitsRes.error) return { ok: false };
  const debitedIds = new Set<string>();
  for (const row of debitsRes.data) if (row.reference_id) debitedIds.add(row.reference_id);
  return { ok: true, candidates: candidatesRes.data, debitedIds };
}

/** Balance, movements and unfinished top-ups for the signed-in user. */
export async function readTrackerWallet(user: SignedIn, now = new Date()): Promise<WalletResult<WalletView>> {
  const { client, userId } = user;
  const since = new Date(now.getTime() - ATTEMPT_WINDOW_MS).toISOString();

  const [walletRes, paymentsRes] = await Promise.all([
    readWalletRow(client, userId),
    client
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("user_id", userId)
      .eq("payment_type", "ads_topup")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(PAYMENT_LIMIT)
      .returns<TrackerPaymentRow[]>(),
  ]);
  if (walletRes.error) return fail(502, "Could not load your wallet.");
  if (paymentsRes.error) return fail(502, "Could not load your top-ups.");

  const wallet = walletRes.data ?? null;
  const payments = paymentsRes.data ?? [];
  let transactions: TrackerWalletTransactionRow[] = [];
  let withdrawals: TrackerWithdrawalRow[] = [];
  let heldCandidates: HeldCandidate[] = [];
  let debitedWithdrawalIds = new Set<string>();
  const creditedPaymentIds = new Set<string>();

  if (wallet) {
    const paymentIds = payments.map((p) => p.id);
    const [txRes, wdRes, creditedRes, heldRes] = await Promise.all([
      client
        .from("wallet_transactions")
        .select(TX_COLUMNS)
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(TX_LIMIT)
        .returns<TrackerWalletTransactionRow[]>(),
      client
        .from("withdrawals")
        .select(WITHDRAWAL_COLUMNS)
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(WITHDRAWAL_LIMIT)
        .returns<TrackerWithdrawalRow[]>(),
      paymentIds.length
        ? client
            .from("wallet_transactions")
            .select("reference_id")
            .eq("wallet_id", wallet.id)
            .eq("direction", "credit")
            .eq("reference_type", "payment")
            .in("reference_id", paymentIds)
            .returns<{ reference_id: string | null }[]>()
        : Promise.resolve({ data: [] as { reference_id: string | null }[], error: null }),
      readHeldInputs(client, wallet.id),
    ]);
    if (txRes.error || wdRes.error || creditedRes.error || !heldRes.ok) {
      return fail(502, "Could not load your wallet activity.");
    }
    transactions = txRes.data ?? [];
    withdrawals = wdRes.data ?? [];
    heldCandidates = heldRes.candidates;
    debitedWithdrawalIds = heldRes.debitedIds;
    for (const row of creditedRes.data ?? []) if (row.reference_id) creditedPaymentIds.add(row.reference_id);
  }

  return {
    ok: true,
    status: 200,
    data: buildWalletView({
      wallet,
      transactions,
      withdrawals,
      heldCandidates,
      debitedWithdrawalIds,
      payments,
      creditedPaymentIds,
      now,
    }),
  };
}

export interface WalletFunds {
  walletId: string | null;
  balance: number;
  /** Withdrawals still held against the balance. */
  held: number;
  /** balance - held, never below zero. */
  available: number;
}

/**
 * Balance, held withdrawals and available balance, without the movement
 * lists. Same rule as the wallet page (buildWalletView uses the same helpers).
 */
export async function readWalletFunds(
  user: Pick<SignedIn, "client" | "userId">
): Promise<WalletResult<WalletFunds>> {
  const walletRes = await readWalletRow(user.client, user.userId);
  if (walletRes.error) return fail(502, "Could not load your wallet.");
  const wallet = walletRes.data ?? null;
  if (!wallet) return { ok: true, status: 200, data: { walletId: null, balance: 0, held: 0, available: 0 } };
  const heldRes = await readHeldInputs(user.client, wallet.id);
  if (!heldRes.ok) return fail(502, "Could not load your wallet.");
  const balance = toAmount(wallet.balance);
  const held = heldWithdrawalAmount(heldRes.candidates, heldRes.debitedIds);
  return {
    ok: true,
    status: 200,
    data: { walletId: wallet.id, balance, held, available: availableBalance(balance, held) },
  };
}

function functionsUrl(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  return `${base}/functions/v1/${slug}`;
}

async function callEdgeFunction(
  slug: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  try {
    const res = await fetch(functionsUrl(slug), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, payload };
  } catch {
    return { ok: false, status: 504, payload: {} };
  }
}

/** Paystack checkout pages live on paystack.com; refuse to redirect anywhere else. */
function isPaystackCheckout(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      (parsed.hostname === "paystack.com" ||
        parsed.hostname.endsWith(".paystack.com") ||
        parsed.hostname === "paystack.co" ||
        parsed.hostname.endsWith(".paystack.co"))
    );
  } catch {
    return false;
  }
}

/**
 * Start a Paystack top-up. Creates a pending ads_topup payment (inside the
 * edge function) and returns the checkout URL. Nothing is credited here: the
 * webhook or verifyTopUp settles the wallet once Paystack confirms payment.
 */
export async function startTopUp(
  user: SignedIn,
  input: { amount?: unknown; method?: unknown },
  callbackUrl: string
): Promise<WalletResult<{ checkoutUrl: string; reference: string }>> {
  const parsed = parseTopUpInput(input);
  if (!parsed.ok) return fail(400, parsed.error);

  const res = await callEdgeFunction("initialize-paystack-payment", user.accessToken, {
    amount: parsed.amount,
    currency: "KES",
    payment_type: "ads_topup",
    method: parsed.method,
    payer_email: user.email,
    comment: "Wallet top-up (M-Taji Siasa)",
    redirect_url: callbackUrl,
  });
  if (!res.ok) {
    const message = typeof res.payload.error === "string" ? res.payload.error : undefined;
    if (res.status === 401) return fail(401, "Your session has expired. Sign in again.");
    if (res.status === 400) return fail(400, walletErrorMessage(message));
    return fail(502, "Paystack could not start the payment. Try again shortly.");
  }
  const checkoutUrl = String(res.payload.authorization_url ?? res.payload.checkout_url ?? "");
  const reference = String(res.payload.reference ?? res.payload.api_ref ?? "");
  if (!checkoutUrl || !reference || !isPaystackCheckout(checkoutUrl)) {
    return fail(502, "Paystack did not return a checkout page.");
  }
  return { ok: true, status: 201, data: { checkoutUrl, reference } };
}

/**
 * Confirm a top-up after the user returns from Paystack. Only the user's own
 * ads_topup payments can be verified through Siasa.
 */
export const VERIFY_RETRY_MESSAGE = "We couldn't confirm your payment with Paystack yet. Try again in a moment.";

export async function verifyTopUp(
  user: SignedIn,
  reference: string,
  now = new Date()
): Promise<WalletResult<TopUpVerification>> {
  const { data: payment, error } = await user.client
    .from("payments")
    .select("id, payment_type, status, created_at")
    .eq("user_id", user.userId)
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle<{ id: string; payment_type: string; status: string; created_at: string }>();
  if (error) return fail(502, "Could not look up that top-up.");
  if (!payment || payment.payment_type !== "ads_topup") return fail(404, "We could not find that top-up.");

  const res = await callEdgeFunction("verify-paystack-payment", user.accessToken, { reference });
  if (!res.ok) {
    if (res.status === 401) return fail(401, "Your session has expired. Sign in again.");
    const message = typeof res.payload.error === "string" ? res.payload.error.toLowerCase() : "";
    // Paystack answers "Transaction reference not found" for a checkout never paid:
    // a real answer, so the top-up is still pending.
    if ((res.status === 400 || res.status === 404) && message.includes("not found")) {
      return {
        ok: true,
        status: 200,
        data: { paystackStatus: "not_found", outcome: "pending", amount: 0, reference },
      };
    }
    // 5xx, timeout, anything else: no answer, so do not report an outcome.
    return fail(502, VERIFY_RETRY_MESSAGE);
  }
  return {
    ok: true,
    status: 200,
    data: interpretVerification(res.payload, reference, { createdAt: payment.created_at, now }),
  };
}

/**
 * Ask for a payout. request_withdrawal records a pending withdrawal; the
 * balance moves only when the Tracker pays it out (complete_withdrawal).
 * The RPC checks the amount against balance minus held withdrawals under the
 * wallet lock and is the authority; Siasa's pre-check only gives a quicker,
 * friendlier answer and may be stale.
 */
export async function requestWithdrawal(
  user: SignedIn,
  input: { amount?: unknown; method?: unknown; destination?: unknown }
): Promise<WalletResult<{ withdrawalId: string }>> {
  const parsed = parseWithdrawalInput(input);
  if (!parsed.ok) return fail(400, parsed.error);

  const funds = await readWalletFunds(user);
  if (!funds.ok) return funds;
  if (!funds.data.walletId) return fail(400, "Your wallet has no funds yet. Top up first.");
  if (parsed.amount > funds.data.available) return fail(409, AVAILABLE_BALANCE_MESSAGE);

  const { data, error } = await user.client.rpc("request_withdrawal", {
    p_wallet_id: funds.data.walletId,
    p_amount: parsed.amount,
    p_method: parsed.method,
    p_destination: parsed.destination,
  });
  if (error) {
    const mapped = classifyWalletRpcError(error, 409);
    return fail(mapped.status, mapped.error);
  }
  if (data == null || data === "") return fail(502, "The payment service did not confirm the withdrawal. Check your wallet before trying again.");
  return { ok: true, status: 201, data: { withdrawalId: String(data) } };
}

/**
 * Available balance (balance minus held withdrawals) for the signed-in user.
 * The ads pre-check; the ad-debit RPCs re-check under the wallet lock.
 */
export async function trackerAvailableBalance(
  user: Pick<SignedIn, "client" | "userId">
): Promise<WalletResult<number>> {
  const funds = await readWalletFunds(user);
  if (!funds.ok) return funds;
  return { ok: true, status: 200, data: funds.data.available };
}

/* ------------------------------------------------------------------ */
/* Ad spend. Called by the ads module, never from a route directly.     */
/* ------------------------------------------------------------------ */

export function isAdSpendProvider(value: string): value is AdSpendProvider {
  return (AD_SPEND_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Debit the wallet when an ad goes live on one network. Idempotent per
 * (campaign, provider) in the Tracker: a second call returns the first debit.
 * campaignId must be a Tracker adly_campaigns.id owned by the signed-in user.
 */
export async function debitWalletForAdSpend(
  user: SignedIn,
  input: { campaignId: string; provider: AdSpendProvider; amountKes: number; reference?: string }
): Promise<WalletResult<{ transactionId: string }>> {
  if (!isAdSpendProvider(input.provider)) return fail(400, walletErrorMessage("invalid provider"));
  if (!Number.isFinite(input.amountKes) || input.amountKes <= 0) return fail(400, "Enter a valid amount.");
  const { data, error } = await user.client.rpc("debit_wallet_for_ad_spend", {
    p_campaign_id: input.campaignId,
    p_provider: input.provider,
    p_amount: input.amountKes,
    p_reference: input.reference ?? `${input.campaignId}:${input.provider}`,
  });
  if (error) {
    const mapped = classifyWalletRpcError(error, 402);
    return fail(mapped.status, mapped.error);
  }
  return { ok: true, status: 201, data: { transactionId: String(data) } };
}

/**
 * Debit only the increase when a live campaign's budget on one network grows
 * to newTotalKes. Returns deltaKes = 0 when nothing more is owed.
 */
export async function debitWalletForAdSpendUpdate(
  user: SignedIn,
  input: { campaignId: string; provider: AdSpendProvider; newTotalKes: number }
): Promise<WalletResult<{ transactionId: string | null; deltaKes: number }>> {
  if (!isAdSpendProvider(input.provider)) return fail(400, walletErrorMessage("invalid provider"));
  if (!Number.isFinite(input.newTotalKes) || input.newTotalKes < 0) return fail(400, "Enter a valid amount.");
  const { data, error } = await user.client.rpc("debit_wallet_for_ad_spend_update", {
    p_campaign_id: input.campaignId,
    p_provider: input.provider,
    p_new_total_amount: input.newTotalKes,
  });
  if (error) {
    const mapped = classifyWalletRpcError(error, 402);
    return fail(mapped.status, mapped.error);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { txn_id?: string | null; delta_amount?: number | string } | null;
  return {
    ok: true,
    status: 200,
    data: { transactionId: row?.txn_id ?? null, deltaKes: Number(row?.delta_amount ?? 0) || 0 },
  };
}
