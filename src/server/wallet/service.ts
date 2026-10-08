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

export function resolveWalletLeader(actor: ContentActor, requested?: string): string | ContentResult {
  if (isAdmin(actor)) {
    if (!requested) return fail(400, "leaderId is required.");
    if (!getRepositories().content.findLeader(requested)) {
      return fail(404, "Leader not found.");
    }
    return requested;
  }
  if (requested && requested !== actor.leaderId) {
    return fail(403, "You can only manage your own wallet.");
  }
  return actor.leaderId;
}

export function readWallet(actor: ContentActor, requested?: string): ContentResult {
  const leaderId = resolveWalletLeader(actor, requested);
  if (typeof leaderId !== "string") return leaderId;
  const wallet = present(getRepositories().wallets.get(leaderId));
  return { ok: true, status: 200, body: { ok: true, wallet } };
}

export function topUpWallet(
  actor: ContentActor,
  input: { amount: unknown; source: unknown; leaderId?: unknown }
): ContentResult {
  const leaderId = resolveWalletLeader(actor, asId(input.leaderId));
  if (typeof leaderId !== "string") return leaderId;
  const amount = asAmount(input.amount);
  if (amount == null) return fail(400, "Enter a valid top-up amount.");
  if (typeof input.source !== "string" || !TOP_UP_SOURCES.includes(input.source as TopUpSource)) {
    return fail(400, "Choose a top-up source.");
  }
  const source = input.source as TopUpSource;
  const current = present(getRepositories().wallets.get(leaderId));
  const createdAt = new Date().toISOString();
  const movement: WalletMovement = {
    id: createId("mov"),
    kind: "top-up",
    amount,
    source,
    status: "recorded",
    createdAt,
  };
  const saved = getRepositories().wallets.save({
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

export function withdrawWallet(
  actor: ContentActor,
  input: { amount: unknown; leaderId?: unknown }
): ContentResult {
  const leaderId = resolveWalletLeader(actor, asId(input.leaderId));
  if (typeof leaderId !== "string") return leaderId;
  const amount = asAmount(input.amount);
  if (amount == null) return fail(400, "Enter a valid withdrawal amount.");
  const current = present(getRepositories().wallets.get(leaderId));
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
  const saved = getRepositories().wallets.save({
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
