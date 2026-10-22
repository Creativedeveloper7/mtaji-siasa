import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrackerChannel } from "@/server/tracker/adly/rows";

/**
 * Ad-spend wallet calls for the Adly publish flow.
 *
 * CONSOLIDATE: src/server/tracker/wallet/service.ts exposes
 * debitWalletForAdSpend / debitWalletForAdSpendUpdate / trackerAvailableBalance
 * with the same RPCs. Once that module settles, replace these three functions
 * with calls into it and delete this file.
 *
 * The RPCs are SECURITY DEFINER and act on auth.uid(), so `client` must be the
 * signed-in user's client. They only accept google | meta | tiktok | x.
 */

const RPC_PROVIDERS = ["google", "meta", "tiktok", "x"] as const;
type RpcProvider = (typeof RPC_PROVIDERS)[number];

export function isWalletProvider(channel: TrackerChannel): channel is RpcProvider {
  return (RPC_PROVIDERS as readonly string[]).includes(channel);
}

export type DebitResult = { ok: true; deltaKes: number } | { ok: false; error: string };

function message(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("insufficient")) return "Your wallet balance is too low for this. Top up first.";
  if (m.includes("not authenticated")) return "Your session has expired. Sign in again.";
  if (m.includes("campaign not found")) return "That ad campaign is not linked to your account.";
  if (m.includes("invalid provider")) return "That ad network is not supported for wallet payments.";
  return raw;
}

/** First publish on a network: reserve the full share. Idempotent per (campaign, provider). */
export async function debitForAdSpend(
  client: SupabaseClient,
  campaignId: string,
  provider: TrackerChannel,
  amountKes: number
): Promise<DebitResult> {
  if (!isWalletProvider(provider)) return { ok: false, error: message("invalid provider") };
  const { error } = await client.rpc("debit_wallet_for_ad_spend", {
    p_campaign_id: campaignId,
    p_provider: provider,
    p_amount: amountKes,
    p_reference: `${campaignId}:${provider}`,
  });
  if (error) return { ok: false, error: message(error.message) };
  return { ok: true, deltaKes: amountKes };
}

/** Republish of a live network: reserve only the increase over what is already debited. */
export async function debitForAdSpendUpdate(
  client: SupabaseClient,
  campaignId: string,
  provider: TrackerChannel,
  newTotalKes: number
): Promise<DebitResult> {
  if (!isWalletProvider(provider)) return { ok: false, error: message("invalid provider") };
  const { data, error } = await client.rpc("debit_wallet_for_ad_spend_update", {
    p_campaign_id: campaignId,
    p_provider: provider,
    p_new_total_amount: newTotalKes,
  });
  if (error) return { ok: false, error: message(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { delta_amount?: number | string } | null;
  return { ok: true, deltaKes: Number(row?.delta_amount ?? 0) || 0 };
}

/** wallets.balance for the user (0 when no wallet row yet). */
export async function walletBalance(client: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await client.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Could not read wallet: ${error.message}`);
  return Number(data?.balance ?? 0) || 0;
}

/** KES already debited for this campaign on one network (gates a republish on the delta only). */
export async function alreadyDebitedKes(client: SupabaseClient, campaignId: string, provider: TrackerChannel): Promise<number> {
  const { data, error } = await client
    .from("wallet_transactions")
    .select("amount, metadata")
    .eq("reference_type", "adly_campaign")
    .eq("reference_id", campaignId)
    .eq("direction", "debit")
    .eq("source", "ads");
  if (error || !data) return 0;
  return data
    .filter((row) => (row.metadata as Record<string, unknown> | null)?.provider === provider)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
