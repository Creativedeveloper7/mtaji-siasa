"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandCoins,
  Package,
  PiggyBank,
  Users,
} from "lucide-react";
import {
  AdminField,
  AdminHeader,
  AdminInput,
  AdminSelect,
} from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { formatCurrency } from "@/lib/utils";

type FundSourceId =
  | "crowdfunding"
  | "merchandise"
  | "donations"
  | "transfers";

interface FundSource {
  id: FundSourceId;
  label: string;
  description: string;
  balance: number;
  icon: typeof Users;
}

const TOP_UP_SOURCES = [
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Debit / credit card" },
  { value: "crowdfunding", label: "Crowdfunding pool" },
  { value: "merchandise", label: "Merchandise sales" },
] as const;

const WALLET_STORAGE_PREFIX = "mtaji-siasa-wallet-v1:";

interface WalletState {
  sources: Record<FundSourceId, number>;
  lastTopUpAt?: string;
  lastWithdrawalAt?: string;
}

const DEFAULT_SOURCES: Record<FundSourceId, number> = {
  crowdfunding: 185000,
  merchandise: 62400,
  donations: 41000,
  transfers: 15000,
};

function loadWallet(leaderId: string): WalletState {
  if (typeof window === "undefined") {
    return { sources: { ...DEFAULT_SOURCES } };
  }
  try {
    const raw = localStorage.getItem(`${WALLET_STORAGE_PREFIX}${leaderId}`);
    if (!raw) return { sources: { ...DEFAULT_SOURCES } };
    const parsed = JSON.parse(raw) as WalletState;
    return {
      ...parsed,
      sources: { ...DEFAULT_SOURCES, ...parsed.sources },
    };
  } catch {
    return { sources: { ...DEFAULT_SOURCES } };
  }
}

function saveWallet(leaderId: string, state: WalletState) {
  localStorage.setItem(
    `${WALLET_STORAGE_PREFIX}${leaderId}`,
    JSON.stringify(state)
  );
}

export default function PoliticianWalletPage() {
  const { leader } = usePoliticianProfile();
  const [wallet, setWallet] = useState<WalletState | null>(null);

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpSource, setTopUpSource] = useState<string>(TOP_UP_SOURCES[0].value);
  const [topUpNote, setTopUpNote] = useState<string | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNote, setWithdrawNote] = useState<string | null>(null);

  useEffect(() => {
    if (!leader) return;
    setWallet(loadWallet(leader.id));
  }, [leader]);

  const persist = useCallback(
    (next: WalletState) => {
      if (!leader) return;
      setWallet(next);
      saveWallet(leader.id, next);
    },
    [leader]
  );

  const fundCards: FundSource[] = useMemo(() => {
    const sources = wallet?.sources ?? DEFAULT_SOURCES;
    return [
      {
        id: "crowdfunding",
        label: "Crowdfunding",
        description: "Citizen contributions and campaign pools",
        balance: sources.crowdfunding,
        icon: Users,
      },
      {
        id: "merchandise",
        label: "Merchandise sales",
        description: "Proceeds from store requests via Faida",
        balance: sources.merchandise,
        icon: Package,
      },
      {
        id: "donations",
        label: "Direct donations",
        description: "One-off gifts credited to your wallet",
        balance: sources.donations,
        icon: HandCoins,
      },
      {
        id: "transfers",
        label: "Transfers & top-ups",
        description: "Manual top-ups and internal transfers",
        balance: sources.transfers,
        icon: PiggyBank,
      },
    ];
  }, [wallet]);

  const availableBalance = useMemo(
    () => fundCards.reduce((sum, s) => sum + s.balance, 0),
    [fundCards]
  );

  if (!leader || !wallet) return null;

  const handleContinuePaystack = () => {
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpNote("Enter a valid top-up amount.");
      return;
    }
    setTopUpNote(
      `Opening Paystack for ${formatCurrency(amount)} via ${
        TOP_UP_SOURCES.find((s) => s.value === topUpSource)?.label ?? topUpSource
      }…`
    );
    // Prototype: credit transfers ledger after “checkout”
    window.setTimeout(() => {
      persist({
        ...wallet,
        sources: {
          ...wallet.sources,
          transfers: wallet.sources.transfers + amount,
        },
        lastTopUpAt: new Date().toISOString(),
      });
      setTopUpAmount("");
      setTopUpNote(
        `Paystack checkout simulated. ${formatCurrency(amount)} added to Transfers & top-ups.`
      );
    }, 900);
  };

  const handleWithdraw = () => {
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawNote("Enter a valid withdrawal amount.");
      return;
    }
    if (amount > availableBalance) {
      setWithdrawNote("Amount exceeds available balance.");
      return;
    }

    // Draw proportionally from sources for the prototype
    let remaining = amount;
    const nextSources = { ...wallet.sources };
    const order: FundSourceId[] = [
      "transfers",
      "merchandise",
      "donations",
      "crowdfunding",
    ];
    for (const id of order) {
      if (remaining <= 0) break;
      const take = Math.min(nextSources[id], remaining);
      nextSources[id] -= take;
      remaining -= take;
    }

    persist({
      ...wallet,
      sources: nextSources,
      lastWithdrawalAt: new Date().toISOString(),
    });
    setWithdrawAmount("");
    setWithdrawNote(
      `Withdrawal request submitted for ${formatCurrency(amount)}. Processing typically takes 1–2 business days.`
    );
  };

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Wallet"
        description="Track funds by source, top up via Paystack, and request withdrawals."
      />

      <section className="rounded-lg border border-border-accent bg-accent-soft p-6 sm:p-8">
        <p className="meta-label text-accent">Available balance</p>
        <p className="mt-3 font-mono text-display text-ink sm:text-[2.5rem]">
          {formatCurrency(availableBalance)}
        </p>
        <p className="mt-2 max-w-xl text-small text-ink-muted">
          Combined across crowdfunding, merchandise sales, donations, and
          transfers for {leader.honorific} {leader.name}.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-h3 text-ink">Funds by source</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {fundCards.map((source) => {
            const Icon = source.icon;
            const share =
              availableBalance > 0
                ? Math.round((source.balance / availableBalance) * 100)
                : 0;
            return (
              <article
                key={source.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-bg-elevated text-accent">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <span className="text-caption text-ink-subtle">{share}%</span>
                </div>
                <h3 className="mt-4 text-small font-medium text-ink">
                  {source.label}
                </h3>
                <p className="mt-1 text-caption text-ink-muted">
                  {source.description}
                </p>
                <p className="mt-4 font-mono text-h3 text-accent">
                  {formatCurrency(source.balance)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3 text-ink">Add funds</h2>
          <p className="mt-1 text-small text-ink-muted">
            Top up your wallet and choose where the funds should come from.
          </p>

          <div className="mt-6 space-y-4">
            <AdminField label="Amount (KES)">
              <AdminInput
                type="number"
                min={1}
                step={100}
                placeholder="e.g. 5000"
                value={topUpAmount}
                onChange={(e) => {
                  setTopUpAmount(e.target.value);
                  setTopUpNote(null);
                }}
              />
            </AdminField>
            <AdminField
              label="Source"
              hint="Select the channel or pool you intend to pull funds from."
            >
              <AdminSelect
                value={topUpSource}
                onChange={(e) => setTopUpSource(e.target.value)}
              >
                {TOP_UP_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <Button type="button" fullWidth onClick={handleContinuePaystack}>
              Continue to Paystack
            </Button>
            {topUpNote && (
              <p className="text-caption text-ink-muted" role="status">
                {topUpNote}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3 text-ink">Withdraw funds</h2>
          <p className="mt-1 text-small text-ink-muted">
            Request a withdrawal from your available balance.
          </p>

          <div className="mt-6 space-y-4">
            <AdminField label="Amount (KES)">
              <AdminInput
                type="number"
                min={1}
                step={100}
                placeholder="e.g. 10000"
                value={withdrawAmount}
                onChange={(e) => {
                  setWithdrawAmount(e.target.value);
                  setWithdrawNote(null);
                }}
              />
            </AdminField>
            <p className="text-caption text-ink-subtle">
              Available to withdraw: {formatCurrency(availableBalance)}
            </p>
            <Button type="button" fullWidth onClick={handleWithdraw}>
              Submit withdrawal
            </Button>
            {withdrawNote && (
              <p className="text-caption text-ink-muted" role="status">
                {withdrawNote}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
