"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { X, Heart, Users, HandHeart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FaidaCTA } from "@/components/faida/FaidaCTA";
import type { FaidaIntent } from "@/components/faida/FaidaProvider";
import { formatCurrency } from "@/lib/utils";

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
  leaderName: string;
}

type SupportOption = {
  id: string;
  title: string;
  description: string;
  intent: FaidaIntent;
  icon: typeof Heart;
};

type DonorMode = "anonymous" | "personal";
type Step = "options" | "donate" | "payment";

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000];

const options: SupportOption[] = [
  {
    id: "donate",
    title: "Donate",
    description: "Contribute financially with a secure payment checkout.",
    intent: "donate",
    icon: Heart,
  },
  {
    id: "movement",
    title: "Join Movement",
    description: "Become part of organised community mobilisation.",
    intent: "movement",
    icon: Users,
  },
  {
    id: "volunteer",
    title: "Volunteer",
    description: "Offer time and skills for local activities.",
    intent: "volunteer",
    icon: HandHeart,
  },
];

const fieldClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-small text-ink transition-colors hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30";

export function SupportModal({ open, onClose, leaderName }: SupportModalProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("options");

  const [donorMode, setDonorMode] = useState<DonorMode>("anonymous");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<number | null>(1000);
  const [customAmount, setCustomAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "done"
  >("idle");

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setStep("options");
    setDonorMode("anonymous");
    setFullName("");
    setEmail("");
    setPhone("");
    setAmount(1000);
    setCustomAmount("");
    setFormError(null);
    setPaymentStatus("idle");
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

  if (!open) return null;

  const active = options.find((o) => o.id === selected);
  const resolvedAmount =
    amount ?? (customAmount ? Number(customAmount) : NaN);

  const handleSelectOption = (id: string) => {
    setSelected(id);
    setFormError(null);
    if (id === "donate") {
      setStep("donate");
    } else {
      setStep("options");
    }
  };

  const handleDonateContinue = () => {
    if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
      setFormError("Select or enter a valid donation amount.");
      return;
    }
    if (donorMode === "personal") {
      if (!fullName.trim() || !email.trim() || !phone.trim()) {
        setFormError("Fill in your name, email, and phone to continue.");
        return;
      }
    }
    setFormError(null);
    setPaymentStatus("idle");
    setStep("payment");
  };

  const handlePaystack = () => {
    setPaymentStatus("processing");
    window.setTimeout(() => {
      setPaymentStatus("done");
    }, 1200);
  };

  const title =
    step === "donate"
      ? `Donate to ${leaderName}`
      : step === "payment"
        ? "Payment"
        : `Support ${leaderName}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-bg/80 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-bg-elevated shadow-raised sm:rounded-xl animate-slide-up">
        <header className="flex items-start justify-between border-b border-border px-5 py-4 md:px-6">
          <div className="flex items-start gap-2">
            {step !== "options" && (
              <button
                type="button"
                onClick={() => {
                  if (step === "payment") setStep("donate");
                  else {
                    setStep("options");
                    setSelected(null);
                  }
                }}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-border">
                <Image
                  src="/mtaji-logo.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              </span>
              <div>
                <p className="meta-label">Engagement</p>
                <h2 id={titleId} className="mt-1 text-h3 text-ink">
                  {title}
                </h2>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
          {step === "options" && (
            <div className="space-y-3">
              {options.map((opt) => {
                const Icon = opt.icon;
                const isActive = selected === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectOption(opt.id)}
                    className={`flex w-full items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors ${
                      isActive
                        ? "border-accent/40 bg-accent-soft"
                        : "border-border bg-surface hover:border-border-strong"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-accent">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-small font-medium text-ink">
                        {opt.title}
                      </span>
                      <span className="mt-1 block text-small text-ink-muted">
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === "donate" && (
            <div className="space-y-6">
              <fieldset>
                <legend className="meta-label">Donor identity</legend>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: "anonymous",
                        label: "Anonymous",
                        hint: "No personal details required",
                      },
                      {
                        id: "personal",
                        label: "Share details",
                        hint: "Name, email & phone",
                      },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setDonorMode(mode.id);
                        setFormError(null);
                      }}
                      className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                        donorMode === mode.id
                          ? "border-accent/40 bg-accent-soft"
                          : "border-border bg-surface hover:border-border-strong"
                      }`}
                    >
                      <span className="block text-small font-medium text-ink">
                        {mode.label}
                      </span>
                      <span className="mt-1 block text-caption text-ink-muted">
                        {mode.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {donorMode === "personal" && (
                <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
                  <label className="block space-y-1.5">
                    <span className="meta-label">Full name</span>
                    <input
                      className={fieldClass}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="meta-label">Email</span>
                    <input
                      className={fieldClass}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="meta-label">Phone</span>
                    <input
                      className={fieldClass}
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+254…"
                      autoComplete="tel"
                    />
                  </label>
                </div>
              )}

              <fieldset>
                <legend className="meta-label">Donation amount (KES)</legend>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {PRESET_AMOUNTS.map((preset) => {
                    const activeAmt =
                      amount === preset && customAmount === "";
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAmount(preset);
                          setCustomAmount("");
                          setFormError(null);
                        }}
                        className={`rounded-md border px-2 py-2.5 font-mono text-small transition-colors ${
                          activeAmt
                            ? "border-accent/40 bg-accent-soft text-accent"
                            : "border-border bg-surface text-ink hover:border-border-strong"
                        }`}
                      >
                        {preset.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block space-y-1.5">
                  <span className="meta-label">Or enter custom amount</span>
                  <input
                    className={fieldClass}
                    type="number"
                    min={1}
                    step={100}
                    placeholder="e.g. 7500"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setAmount(null);
                      setFormError(null);
                    }}
                  />
                </label>
              </fieldset>

              {formError && (
                <p className="text-caption text-error" role="alert">
                  {formError}
                </p>
              )}
            </div>
          )}

          {step === "payment" && (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="min-w-full text-left text-small">
                  <tbody className="divide-y divide-border">
                    <tr>
                      <th className="bg-surface px-4 py-3 font-medium text-ink-muted">
                        Recipient
                      </th>
                      <td className="px-4 py-3 text-ink">{leaderName}</td>
                    </tr>
                    <tr>
                      <th className="bg-surface px-4 py-3 font-medium text-ink-muted">
                        Donor
                      </th>
                      <td className="px-4 py-3 text-ink">
                        {donorMode === "anonymous"
                          ? "Anonymous"
                          : fullName.trim()}
                      </td>
                    </tr>
                    {donorMode === "personal" && (
                      <>
                        <tr>
                          <th className="bg-surface px-4 py-3 font-medium text-ink-muted">
                            Email
                          </th>
                          <td className="px-4 py-3 text-ink">{email.trim()}</td>
                        </tr>
                        <tr>
                          <th className="bg-surface px-4 py-3 font-medium text-ink-muted">
                            Phone
                          </th>
                          <td className="px-4 py-3 text-ink">{phone.trim()}</td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <th className="bg-surface px-4 py-3 font-medium text-ink-muted">
                        Amount
                      </th>
                      <td className="px-4 py-3 font-mono text-accent">
                        {formatCurrency(resolvedAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {paymentStatus === "done" ? (
                <div className="rounded-lg border border-border bg-accent-soft px-4 py-4">
                  <p className="text-small font-medium text-ink">
                    Payment confirmed
                  </p>
                  <p className="mt-1 text-small text-ink-muted">
                    Thank you. Your {formatCurrency(resolvedAmount)} donation to{" "}
                    {leaderName} was recorded (prototype checkout).
                  </p>
                </div>
              ) : (
                <p className="text-small text-ink-muted">
                  You will complete payment securely through Paystack. This
                  prototype simulates the checkout flow.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-border px-5 py-4 md:px-6">
          {step === "options" &&
            (active && active.id !== "donate" ? (
              <div className="space-y-3">
                <p className="text-small text-ink-muted">
                  Primary action continues through Faida on WhatsApp.
                </p>
                <FaidaCTA
                  intent={active.intent}
                  contextLabel={`${active.title} · ${leaderName}`}
                  fullWidth
                  label="Continue with Faida"
                />
              </div>
            ) : (
              <Button fullWidth type="button" variant="secondary" disabled>
                Select an option to continue
              </Button>
            ))}

          {step === "donate" && (
            <Button fullWidth type="button" onClick={handleDonateContinue}>
              Continue
            </Button>
          )}

          {step === "payment" &&
            (paymentStatus === "done" ? (
              <Button fullWidth type="button" onClick={onClose}>
                Done
              </Button>
            ) : (
              <Button
                fullWidth
                type="button"
                onClick={handlePaystack}
                disabled={paymentStatus === "processing"}
              >
                {paymentStatus === "processing"
                  ? "Connecting to Paystack…"
                  : "Continue to Paystack"}
              </Button>
            ))}
        </footer>
      </div>
    </div>
  );
}
