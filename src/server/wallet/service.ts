import { createId } from "@/lib/store";
import { getRepositories } from "@/server";
import type { ContentActor, ContentResult } from "@/server/content/service";
import {
  DEFAULT_WALLET_SOURCES,
  type FundSourceId,
  type TopUpSource,
  type WalletMovement,
  type WalletRecord,
} from "@/server/domain";

const TOP_UP_SOURCES: readonly TopUpSource[] = [
  "mpesa",
  "bank",
  "card",
  "crowdfunding",
  "merchandise",
];

const WITHDRAW_ORDER: readonly FundSourceId[] = [
  "transfers",
  "merchandise",
  "donations",
  "crowdfunding",
];

function fail(status: number, error: string): ContentResult {
  return { ok: false, status, error };
}

function isAdmin(actor: ContentActor): actor is Extract<ContentActor, { role: "admin" }> {
  return actor.role === "admin";
}

function availableBalance(wallet: WalletRecord): number {
  return WITHDRAW_ORDER.reduce((sum, source) => sum + wallet.sources[source], 0);
}

function present(wallet: WalletRecord) {
  return {
    ...wallet,
    sources: { ...DEFAULT_WALLET_SOURCES, ...wallet.sources },
    movements: wallet.movements ?? [],
    availableBalance: availableBalance({
      ...wallet,
      sources: { ...DEFAULT_WALLET_SOURCES, ...wallet.sources },
    }),
  };
}

export async function resolveWalletLeader(
  actor: ContentActor,
  requested?: string
): Promise<string | ContentResult> {
  if (isAdmin(actor)) {
    if (!requested) return fail(400, "leaderId is required.");
    if (!(await getRepositories().content.findLeader(requested))) {
      return fail(404, "Leader not found.");
    }
    return requested;
  }
  if (requested && requested !== actor.leaderId) {
    return fail(403, "You can only manage your own wallet.");
  }
  return actor.leaderId;
}

export async function readWallet(actor: ContentActor, requested?: string): Promise<ContentResult> {
  const leaderId = await resolveWalletLeader(actor, requested);
  if (typeof leaderId !== "string") return leaderId;
  const wallet = present(await getRepositories().wallets.get(leaderId));
  return { ok: true, status: 200, body: { ok: true, wallet } };
}

export async function topUpWallet(
  actor: ContentActor,
  input: { amount: unknown; source: unknown; leaderId?: unknown }
): Promise<ContentResult> {
  const leaderId = await resolveWalletLeader(actor, asId(input.leaderId));
  if (typeof leaderId !== "string") return leaderId;
  const amount = asAmount(input.amount);
  if (amount == null) return fail(400, "Enter a valid top-up amount.");
  if (typeof input.source !== "string" || !TOP_UP_SOURCES.includes(input.source as TopUpSource)) {
    return fail(400, "Choose a top-up source.");
  }
  const source = input.source as TopUpSource;
  const current = present(await getRepositories().wallets.get(leaderId));
  const createdAt = new Date().toISOString();
  const movement: WalletMovement = {
    id: createId("mov"),
    kind: "top-up",
    amount,
    source,
    status: "recorded",
    createdAt,
  };
  const saved = await getRepositories().wallets.save({
    leaderId,
    sources: {
      ...current.sources,
      transfers: current.sources.transfers + amount,
    },
    lastTopUpAt: createdAt,
    lastWithdrawalAt: current.lastWithdrawalAt,
    movements: [movement, ...current.movements],
  });
  return {
    ok: true,
    status: 201,
    body: { ok: true, wallet: present(saved), movement },
  };
}

export async function withdrawWallet(
  actor: ContentActor,
  input: { amount: unknown; leaderId?: unknown }
): Promise<ContentResult> {
  const leaderId = await resolveWalletLeader(actor, asId(input.leaderId));
  if (typeof leaderId !== "string") return leaderId;
  const amount = asAmount(input.amount);
  if (amount == null) return fail(400, "Enter a valid withdrawal amount.");
  const current = present(await getRepositories().wallets.get(leaderId));
  if (amount > availableBalance(current)) {
    return fail(400, "Amount exceeds available balance.");
  }
  let remaining = amount;
  const sources = { ...current.sources };
  for (const source of WITHDRAW_ORDER) {
    if (remaining <= 0) break;
    const take = Math.min(sources[source], remaining);
    sources[source] -= take;
    remaining -= take;
  }
  const createdAt = new Date().toISOString();
  const movement: WalletMovement = {
    id: createId("mov"),
    kind: "withdrawal",
    amount,
    status: "recorded",
    createdAt,
  };
  const saved = await getRepositories().wallets.save({
    leaderId,
    sources,
    lastTopUpAt: current.lastTopUpAt,
    lastWithdrawalAt: createdAt,
    movements: [movement, ...current.movements],
  });
  return {
    ok: true,
    status: 201,
    body: { ok: true, wallet: present(saved), movement },
  };
}

function asAmount(value: unknown): number | null {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function asId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Take money for an ad campaign. Draws from sources in the same order as a
 * withdrawal. Returns the updated wallet, or an error when the balance is short.
 */
export async function chargeWallet(
  leaderId: string,
  amount: number,
  note: string,
  reference: string
): Promise<{ ok: true; wallet: ReturnType<typeof present> } | { ok: false; error: string }> {
  const current = present(await getRepositories().wallets.get(leaderId));
  if (amount > availableBalance(current)) {
    return {
      ok: false,
      error: `Your wallet has KES ${Math.floor(availableBalance(current)).toLocaleString()} available. Top up to run this ad.`,
    };
  }
  let remaining = amount;
  const sources = { ...current.sources };
  for (const source of WITHDRAW_ORDER) {
    if (remaining <= 0) break;
    const take = Math.min(sources[source], remaining);
    sources[source] -= take;
    remaining -= take;
  }
  const movement: WalletMovement = {
    id: createId("mov"),
    kind: "ad-spend",
    amount,
    status: "recorded",
    note,
    reference,
    createdAt: new Date().toISOString(),
  };
  const saved = await getRepositories().wallets.save({
    ...current,
    sources,
    movements: [movement, ...current.movements],
  });
  return { ok: true, wallet: present(saved) };
}

/** Return unspent ad money to the wallet (credited to transfers). */
export async function refundWallet(leaderId: string, amount: number, note: string, reference: string) {
  if (amount <= 0) return;
  const current = present(await getRepositories().wallets.get(leaderId));
  const movement: WalletMovement = {
    id: createId("mov"),
    kind: "ad-refund",
    amount: Math.round(amount * 100) / 100,
    status: "recorded",
    note,
    reference,
    createdAt: new Date().toISOString(),
  };
  await getRepositories().wallets.save({
    ...current,
    sources: { ...current.sources, transfers: current.sources.transfers + movement.amount },
    movements: [movement, ...current.movements],
  });
}

export async function walletBalance(leaderId: string): Promise<number> {
  return availableBalance(present(await getRepositories().wallets.get(leaderId)));
}
