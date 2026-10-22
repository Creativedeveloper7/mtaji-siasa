"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, PiggyBank, Users } from "lucide-react";
import {
  AdminField,
  AdminHeader,
  AdminInput,
  AdminSelect,
} from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { apiJson } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import type {
  TopUpAttempt,
  TopUpVerification,
  WalletActivity,
  WalletView,
} from "@/server/tracker/wallet/types";

/** Kept in step with MIN_TOP_UP_KES on the server. */
const MIN_TOP_UP = 100;

const PAY_METHODS = [
  { value: "M-PESA", label: "M-Pesa" },
  { value: "CARD-PAYMENT", label: "Card or bank" },
] as const;

const PAYOUT_METHODS = [
  { value: "mpesa", label: "M-Pesa", placeholder: "e.g. 0712 345 678" },
  { value: "bank_transfer", label: "Bank transfer", placeholder: "Bank, branch and account number" },
] as const;

/** sessionStorage key for the reference of a checkout in progress. */
const PENDING_REF_KEY = "mtaji_siasa_topup_ref";

const MOVEMENT_LABELS: Record<WalletActivity["kind"], string> = {
  "top-up": "Top-up",
  crowdfunding: "Crowdfunding",
  shop: "Merchandise sale",
  withdrawal: "Withdrawal",
  "ad-spend": "Ad payment",
  "ad-refund": "Ad refund",
  other: "Other",
};

const ATTEMPT_LABELS: Record<TopUpAttempt["state"], string> = {
  "awaiting-payment": "Awaiting payment",
  processing: "Paid, crediting wallet",
  "not-completed": "Not completed",
  failed: "Failed",
};

type Notice = { tone: "info" | "success" | "warning" | "error"; text: string };

const NOTICE_CLASSES: Record<Notice["tone"], string> = {
  info: "border-border bg-surface text-ink-muted",
  success: "border-success/30 bg-success-muted text-ink",
  warning: "border-warning/30 bg-warning-muted text-ink",
  error: "border-error/30 bg-error-muted text-ink",
};

function readStoredRef(): string | null {
  try {
    return sessionStorage.getItem(PENDING_REF_KEY);
  } catch {
    return null;
  }
}

function storeRef(ref: string | null) {
  try {
    if (ref) sessionStorage.setItem(PENDING_REF_KEY, ref);
    else sessionStorage.removeItem(PENDING_REF_KEY);
  } catch {
    /* storage unavailable: the return URL still carries the reference */
  }
}

function verificationNotice(v: TopUpVerification): Notice {
  switch (v.outcome) {
    case "credited":
      return { tone: "success", text: `${formatCurrency(v.amount)} added to your wallet.` };
    case "processing":
      return {
        tone: "warning",
        text: `Paystack confirmed ${formatCurrency(v.amount)}. Your balance will update in a moment; refresh if it does not.`,
      };
    case "pending":
      return {
        tone: "warning",
        text: "Paystack has not confirmed this payment yet. If you approved it, your balance updates once it clears.",
      };
    default:
      return { tone: "error", text: "The payment did not go through. You were not charged; try again." };
  }
}

export default function PoliticianWalletPage() {
  const { leader } = usePoliticianProfile();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<Notice | null>(null);

  const [topUpAmount, setTopUpAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0].value);
  const [topUpNote, setTopUpNote] = useState<Notice | null>(null);
  const [topUpBusy, setTopUpBusy] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<string>(PAYOUT_METHODS[0].value);
  const [destination, setDestination] = useState("");
  const [withdrawNote, setWithdrawNote] = useState<Notice | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await apiJson<{ wallet?: WalletView; error?: string }>("/api/wallet/payments");
    if (result.ok && result.data.wallet) {
      setWallet(result.data.wallet);
      setLoadError(null);
    } else {
      setLoadError(result.data.error || "Could not load your wallet.");
    }
  }, []);

  useEffect(() => {
    if (!leader) return;
    let cancel = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const returning = params.get("topup") === "1";
      const reference = params.get("reference") || params.get("trxref") || (returning ? readStoredRef() : null);

      if (returning) {
        // Drop Paystack's query so a reload does not verify again.
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (returning && reference) {
        setReturnNotice({ tone: "info", text: "Confirming your payment with Paystack…" });
        const result = await apiJson<{ verification?: TopUpVerification; wallet?: WalletView; error?: string }>(
          "/api/wallet/payments/verify",
          { method: "POST", body: JSON.stringify({ reference }) }
        );
        if (cancel) return;
        if (result.ok && result.data.verification) {
          setReturnNotice(verificationNotice(result.data.verification));
          if (result.data.verification.outcome !== "pending") storeRef(null);
          if (result.data.wallet) {
            setWallet(result.data.wallet);
            setLoadError(null);
            return;
          }
        } else {
          setReturnNotice({ tone: "error", text: result.data.error || "Could not confirm the payment." });
        }
      }
      if (!cancel) await load();
    })();
    return () => {
      cancel = true;
    };
  }, [leader, load]);

  const fundCards = useMemo(() => {
    const received = wallet?.received ?? { topUps: 0, crowdfunding: 0, shop: 0 };
    return [
      {
        id: "topUps",
        label: "Top-ups",
        description: "Money you added through Paystack",
        amount: received.topUps,
        icon: PiggyBank,
      },
      {
        id: "crowdfunding",
        label: "Crowdfunding",
        description: "Donations to your campaigns",
        amount: received.crowdfunding,
        icon: Users,
      },
      {
        id: "shop",
        label: "Merchandise sales",
        description: "Paid orders for your products",
        amount: received.shop,
        icon: Package,
      },
    ];
  }, [wallet]);

  const totalReceived = fundCards.reduce((sum, s) => sum + s.amount, 0);

  if (!leader) return null;

  if (!wallet) {
    return (
      <div className="space-y-10">
        <AdminHeader title="Wallet" description="Your M-Taji wallet: top up via Paystack and request withdrawals." />
        {returnNotice && <NoticeBox notice={returnNotice} />}
        {loadError ? (
          <div className="space-y-4">
            <NoticeBox notice={{ tone: "error", text: loadError }} />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-small text-ink-muted" role="status">
            Loading your wallet…
          </p>
        )}
      </div>
    );
  }

  const available = wallet.availableBalance;
  const payout = PAYOUT_METHODS.find((m) => m.value === payoutMethod) ?? PAYOUT_METHODS[0];

  const handleContinuePaystack = async () => {
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setTopUpNote({ tone: "error", text: "Enter a valid top-up amount." });
      return;
    }
    if (amount < MIN_TOP_UP) {
      setTopUpNote({ tone: "error", text: `The minimum top-up is ${formatCurrency(MIN_TOP_UP)}.` });
      return;
    }
    setTopUpBusy(true);
    setTopUpNote({ tone: "info", text: "Opening Paystack checkout…" });
    const result = await apiJson<{ checkoutUrl?: string; reference?: string; error?: string }>(
      "/api/wallet/payments/top-up",
      { method: "POST", body: JSON.stringify({ amount, method: payMethod }) }
    );
    if (!result.ok || !result.data.checkoutUrl) {
      setTopUpBusy(false);
      setTopUpNote({ tone: "error", text: result.data.error || "Could not start the payment." });
      return;
    }
    if (result.data.reference) storeRef(result.data.reference);
    window.location.assign(result.data.checkoutUrl);
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawNote({ tone: "error", text: "Enter a valid withdrawal amount." });
      return;
    }
    if (amount > available) {
      setWithdrawNote({ tone: "error", text: "Amount exceeds your available balance." });
      return;
    }
    if (!destination.trim()) {
      setWithdrawNote({ tone: "error", text: "Enter where the money should be sent." });
      return;
    }
    setWithdrawBusy(true);
    const result = await apiJson<{ wallet?: WalletView; error?: string }>("/api/wallet/payments/withdraw", {
      method: "POST",
      body: JSON.stringify({ amount, method: payoutMethod, destination: destination.trim() }),
    });
    setWithdrawBusy(false);
    if (!result.ok) {
      setWithdrawNote({ tone: "error", text: result.data.error || "Could not request the withdrawal." });
      return;
    }
    if (result.data.wallet) setWallet(result.data.wallet);
    else void load();
    setWithdrawAmount("");
    setWithdrawNote({
      tone: "success",
      text: `Withdrawal of ${formatCurrency(amount)} requested. It stays pending until it is paid out.`,
    });
  };

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Wallet"
        description="Your M-Taji wallet: top up via Paystack and request withdrawals."
      />

      {returnNotice && <NoticeBox notice={returnNotice} />}

      <section className="rounded-lg border border-border-accent bg-accent-soft p-6 sm:p-8">
        <p className="meta-label text-accent">Available balance</p>
        <p className="mt-3 font-mono text-display text-ink sm:text-[2.5rem]">
          {formatCurrency(available)}
        </p>
        <p className="mt-2 max-w-xl text-small text-ink-muted">
          {wallet.pendingWithdrawals > 0
            ? `Wallet balance ${formatCurrency(wallet.balance)}, of which ${formatCurrency(
                wallet.pendingWithdrawals
              )} is held for pending withdrawals.`
            : `One pooled wallet for ${leader.honorific} ${leader.name}. Top-ups, donations and sales all land here and pay for your ads.`}
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-h3 text-ink">Received to date</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fundCards.map((source) => {
            const Icon = source.icon;
            const share = totalReceived > 0 ? Math.round((source.amount / totalReceived) * 100) : 0;
            return (
              <article key={source.id} className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-bg-elevated text-accent">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <span className="text-caption text-ink-subtle">{share}%</span>
                </div>
                <h3 className="mt-4 text-small font-medium text-ink">{source.label}</h3>
                <p className="mt-1 text-caption text-ink-muted">{source.description}</p>
                <p className="mt-4 font-mono text-h3 text-accent">{formatCurrency(source.amount)}</p>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-caption text-ink-subtle">
          Lifetime totals credited to your wallet. Spending and withdrawals come out of the one balance above.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3 text-ink">Add funds</h2>
          <p className="mt-1 text-small text-ink-muted">
            Pay through Paystack. Your balance updates once Paystack confirms the payment.
          </p>

          <div className="mt-6 space-y-4">
            <AdminField label="Amount (KES)" hint={`Minimum ${formatCurrency(MIN_TOP_UP)}.`}>
              <AdminInput
                type="number"
                min={MIN_TOP_UP}
                step={100}
                placeholder="e.g. 5000"
                value={topUpAmount}
                onChange={(e) => {
                  setTopUpAmount(e.target.value);
                  setTopUpNote(null);
                }}
              />
            </AdminField>
            <AdminField label="Pay with">
              <AdminSelect value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {PAY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <Button type="button" fullWidth disabled={topUpBusy} onClick={() => void handleContinuePaystack()}>
              {topUpBusy ? "Opening Paystack…" : "Continue to Paystack"}
            </Button>
            {topUpNote && <NoticeBox notice={topUpNote} compact />}
            {wallet.pendingTopUps.length > 0 && (
              <div>
                <p className="meta-label text-ink-subtle">Recent top-ups not yet in your balance</p>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                  {wallet.pendingTopUps.slice(0, 5).map((a) => (
                    <li key={a.paymentId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-mono text-small text-ink">{formatCurrency(a.amount)}</p>
                        <p className="text-caption text-ink-subtle">{new Date(a.createdAt).toLocaleString()}</p>
                      </div>
                      <StatusBadge
                        tone={a.state === "processing" || a.state === "awaiting-payment" ? "warning" : "error"}
                        label={ATTEMPT_LABELS[a.state]}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="text-h3 text-ink">Withdraw funds</h2>
          <p className="mt-1 text-small text-ink-muted">
            Request a payout from your available balance. Requests are reviewed before money is sent.
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
            <AdminField label="Pay out to">
              <AdminSelect value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)}>
                {PAYOUT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label={payoutMethod === "mpesa" ? "M-Pesa number" : "Account details"}>
              <AdminInput
                type="text"
                placeholder={payout.placeholder}
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setWithdrawNote(null);
                }}
              />
            </AdminField>
            <p className="text-caption text-ink-subtle">Available to withdraw: {formatCurrency(available)}</p>
            <Button
              type="button"
              fullWidth
              disabled={withdrawBusy || available <= 0}
              onClick={() => void handleWithdraw()}
            >
              {withdrawBusy ? "Submitting…" : "Submit withdrawal"}
            </Button>
            {withdrawNote && <NoticeBox notice={withdrawNote} compact />}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-h3 text-ink">Recent activity</h2>
        {wallet.movements.length === 0 ? (
          <p className="mt-4 text-small text-ink-muted">No wallet activity yet. Top up to get started.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
            {wallet.movements.slice(0, 15).map((m) => {
              const incoming = m.direction === "in";
              return (
                <li key={m.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-small text-ink">
                      {MOVEMENT_LABELS[m.kind]}
                      {m.status === "pending" && <StatusBadge tone="warning" label="Pending" />}
                      {m.status === "failed" && <StatusBadge tone="error" label="Not paid" />}
                    </p>
                    <p className="truncate text-caption text-ink-subtle">
                      {m.note ? `${m.note} · ` : ""}
                      {new Date(m.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-small ${
                      m.status === "failed" ? "text-ink-subtle line-through" : incoming ? "text-success" : "text-ink"
                    }`}
                  >
                    {incoming ? "+" : "−"}
                    {formatCurrency(m.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function NoticeBox({ notice, compact }: { notice: Notice; compact?: boolean }) {
  return (
    <p
      className={`rounded-md border ${compact ? "px-3 py-2 text-caption" : "px-4 py-3 text-small"} ${NOTICE_CLASSES[notice.tone]}`}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      {notice.text}
    </p>
  );
}

function StatusBadge({ tone, label }: { tone: "warning" | "error"; label: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-caption ${
        tone === "warning" ? "bg-warning-muted text-warning" : "bg-error-muted text-error"
      }`}
    >
      {label}
    </span>
  );
}
