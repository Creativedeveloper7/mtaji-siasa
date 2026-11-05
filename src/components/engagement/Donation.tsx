"use client";

import { useEffect, useId, useState } from "react";
import { CheckCircle2, CreditCard, Heart, Loader2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiJson } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { DONATION_PRESETS_KES, MAX_DONATION_KES, MIN_DONATION_KES, type DonationMethod, type DonationTarget } from "@/lib/donations";

/**
 * Donations through Paystack, for a project (its owner's wallet) or a leader
 * (their own wallet). The Tracker credits the wallet once Paystack confirms
 * the payment; see src/server/tracker/donations.
 */

const fieldClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-small text-ink transition-colors hover:border-border-strong focus:border-brand-green/60 focus:outline-none focus:ring-1 focus:ring-brand-green/30";

const METHODS: { id: DonationMethod; label: string; hint: string; icon: typeof Smartphone }[] = [
  { id: "M-PESA", label: "M-Pesa", hint: "Pay from your phone", icon: Smartphone },
  { id: "CARD-PAYMENT", label: "Card", hint: "Visa or Mastercard", icon: CreditCard },
];

/** Locks page scroll and closes on Escape while a dialog is open. */
function useDialogKeys(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
}

/**
 * The donate form: a preset or own amount, M-Pesa or card, optional donor
 * details, then Paystack's checkout. Paystack sends the donor back to the
 * recipient's page, where <DonationReturn> confirms the payment.
 */
export function DonationDialog({
  open,
  onClose,
  target,
  recipientName,
}: {
  open: boolean;
  onClose: () => void;
  target: DonationTarget;
  /** "Thika Town Feeder Road" or "Hon. Amara Njehia" */
  recipientName: string;
}) {
  const titleId = useId();
  const [amount, setAmount] = useState<number | null>(1000);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<DonationMethod>("M-PESA");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  const close = () => {
    if (!starting) onClose();
  };
  useDialogKeys(open, close);

  if (!open) return null;

  const resolved = amount ?? (custom ? Number(custom) : NaN);

  const donate = async () => {
    if (!Number.isInteger(resolved) || resolved < MIN_DONATION_KES) {
      setError(`Choose an amount of at least ${formatCurrency(MIN_DONATION_KES)}.`);
      return;
    }
    if (resolved > MAX_DONATION_KES) {
      setError(`The largest single donation is ${formatCurrency(MAX_DONATION_KES)}.`);
      return;
    }
    setError("");
    setStarting(true);
    const result = await apiJson<{ checkoutUrl?: string; error?: string }>("/api/donations", {
      method: "POST",
      body: JSON.stringify({
        ...(target.kind === "project" ? { projectId: target.id } : { leaderId: target.id }),
        amount: resolved,
        method,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      }),
    });
    if (!result.ok || !result.data.checkoutUrl) {
      setStarting(false);
      setError(result.data.error || "Paystack could not start the payment. Try again.");
      return;
    }
    // Paystack's secure checkout; it sends the donor back to the recipient's page.
    window.location.assign(result.data.checkoutUrl);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-bg/80 backdrop-blur-sm" aria-label="Close" onClick={close} />
      <div className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-bg-elevated shadow-raised sm:rounded-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="meta-label text-brand-orange">Donate</p>
            <h2 id={titleId} className="mt-1 text-h3 text-ink">
              Support {recipientName}
            </h2>
            <p className="mt-1 text-caption text-ink-muted">
              {target.kind === "project"
                ? "Your donation goes to the wallet of the team running this project."
                : `Your donation goes to ${recipientName}'s M-Taji wallet.`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="meta-label">Amount (KES)</legend>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {DONATION_PRESETS_KES.map((preset) => {
                const active = amount === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setAmount(preset);
                      setCustom("");
                      setError("");
                    }}
                    className={cn(
                      "min-h-[44px] rounded-md border px-2 font-mono text-small transition-colors",
                      active ? "border-brand-green bg-brand-green text-white" : "border-border bg-surface text-ink hover:border-brand-green/50"
                    )}
                  >
                    {preset.toLocaleString()}
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block space-y-1.5">
              <span className="meta-label">Or your own amount</span>
              <input
                className={fieldClass}
                type="number"
                inputMode="numeric"
                min={MIN_DONATION_KES}
                max={MAX_DONATION_KES}
                step={50}
                placeholder={`At least ${MIN_DONATION_KES}`}
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setAmount(null);
                  setError("");
                }}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend className="meta-label">Pay with Paystack</legend>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {METHODS.map(({ id, label, hint, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={method === id}
                  onClick={() => setMethod(id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                    method === id ? "border-brand-green bg-brand-green/10" : "border-border bg-surface hover:border-border-strong"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", method === id ? "text-brand-green" : "text-ink-muted")} aria-hidden />
                  <span>
                    <span className="block text-small font-medium text-ink">{label}</span>
                    <span className="block text-caption text-ink-muted">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="meta-label">Your details (optional)</legend>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (leave empty to give anonymously)" autoComplete="name" maxLength={120} />
            <input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email, for your Paystack receipt" autoComplete="email" />
            {method === "M-PESA" && (
              <input className={fieldClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="M-Pesa number, e.g. 0712 345 678" autoComplete="tel" />
            )}
          </fieldset>

          {error && (
            <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => void donate()}
            disabled={starting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand-orange px-5 text-small font-bold text-white transition-colors hover:bg-brand-green disabled:opacity-60"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Heart className="h-4 w-4" aria-hidden />}
            {starting
              ? "Opening Paystack…"
              : Number.isFinite(resolved) && resolved > 0
                ? `Donate ${formatCurrency(resolved)} with Paystack`
                : "Donate with Paystack"}
          </button>
          <p className="mt-2 text-center text-caption text-ink-subtle">You complete the payment on Paystack&apos;s secure checkout.</p>
        </footer>
      </div>
    </div>
  );
}

type Verification = { state: "checking" } | { state: "done"; status: string; amount: number } | { state: "error"; message: string };

/**
 * On the recipient's page: when the donor comes back from Paystack
 * (?donation=1&reference=...), confirm the payment once, thank them, and
 * tidy the address bar. Renders nothing otherwise.
 */
export function DonationReturn({ recipientName }: { recipientName: string }) {
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (params.get("donation") !== "1" || !reference) return;
    setVerification({ state: "checking" });
    void apiJson<{ status?: string; amount?: number; error?: string }>("/api/donations/verify", {
      method: "POST",
      body: JSON.stringify({ reference }),
    }).then((result) => {
      if (result.ok) setVerification({ state: "done", status: result.data.status ?? "unknown", amount: result.data.amount ?? 0 });
      else setVerification({ state: "error", message: result.data.error || "We couldn't confirm the payment yet." });
    });
    ["donation", "reference", "trxref"].forEach((key) => params.delete(key));
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  const close = () => setVerification(null);
  useDialogKeys(Boolean(verification), close);

  if (!verification) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Donation">
      <button type="button" className="absolute inset-0 bg-bg/80 backdrop-blur-sm" aria-label="Close" onClick={close} />
      <div className="relative z-10 w-full max-w-md rounded-t-xl border border-border bg-bg-elevated p-6 text-center shadow-raised sm:rounded-xl">
        {verification.state === "checking" ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-green" aria-hidden />
            <p className="mt-3 text-small text-ink">Confirming your donation with Paystack…</p>
          </>
        ) : verification.state === "done" && verification.status === "success" ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-brand-green" aria-hidden />
            <h2 className="mt-3 text-h3 text-ink">Thank you!</h2>
            <p className="mt-2 text-small text-ink-muted">
              Your {formatCurrency(verification.amount)} donation to {recipientName} was received.
            </p>
          </>
        ) : verification.state === "done" ? (
          <>
            <h2 className="text-h3 text-ink">The payment didn&apos;t go through</h2>
            <p className="mt-2 text-small text-ink-muted">Paystack reports it as {verification.status}. Nothing was charged; you can try again.</p>
          </>
        ) : (
          <>
            <h2 className="text-h3 text-ink">Thank you</h2>
            <p className="mt-2 text-small text-ink-muted">{verification.message}</p>
          </>
        )}
        {verification.state !== "checking" && (
          <Button type="button" fullWidth className="mt-5" onClick={close}>
            Done
          </Button>
        )}
      </div>
    </div>
  );
}
