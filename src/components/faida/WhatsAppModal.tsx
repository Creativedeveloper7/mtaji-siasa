"use client";

import { useEffect, useId, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { FAIDA_WHATSAPP_URL } from "@/lib/constants";
import type { FaidaIntent } from "./FaidaProvider";
import { Button } from "@/components/ui/Button";

const intentCopy: Record<
  FaidaIntent,
  { title: string; prompt: string; steps: string[] }
> = {
  connect: {
    title: "Connect with Faida",
    prompt: "Hello Faida — I'd like to engage through M-Taji Siasa.",
    steps: [
      "Share how you'd like to engage",
      "Optionally share your location",
      "Receive updates on WhatsApp",
    ],
  },
  support: {
    title: "Support via Faida",
    prompt: "Hello Faida — I want to support a leader on M-Taji Siasa.",
    steps: ["Choose support type", "Confirm your details", "Continue on WhatsApp"],
  },
  volunteer: {
    title: "Volunteer with Faida",
    prompt: "Hello Faida — I'd like to volunteer.",
    steps: ["Select volunteer interest", "Share availability", "Continue on WhatsApp"],
  },
  movement: {
    title: "Join a movement",
    prompt: "Hello Faida — I'd like to join a movement.",
    steps: ["Confirm movement interest", "Share contact details", "Continue on WhatsApp"],
  },
  updates: {
    title: "Get updates through Faida",
    prompt: "Hello Faida — send me relevant development updates.",
    steps: ["Pick topics of interest", "Share your county", "Continue on WhatsApp"],
  },
  opportunity: {
    title: "Join Faida for opportunities",
    prompt: "Hello Faida — I'd like opportunity updates.",
    steps: ["Select opportunity types", "Share eligibility basics", "Continue on WhatsApp"],
  },
  donate: {
    title: "Donate via Faida",
    prompt: "Hello Faida — I'd like to contribute support.",
    steps: ["Confirm contribution intent", "Receive secure next steps", "Continue on WhatsApp"],
  },
};

interface WhatsAppModalProps {
  open: boolean;
  onClose: () => void;
  intent: FaidaIntent;
  contextLabel?: string;
}

export function WhatsAppModal({
  open,
  onClose,
  intent,
  contextLabel,
}: WhatsAppModalProps) {
  const titleId = useId();
  const copy = intentCopy[intent];
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStep(0);
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

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
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
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-xl border border-border bg-bg-elevated shadow-raised sm:rounded-xl animate-slide-up">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366]">
              <MessageCircle className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 id={titleId} className="text-small font-medium text-ink">
                Faida
              </h2>
              <p className="text-caption text-ink-subtle">WhatsApp engagement</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {contextLabel && (
            <p className="rounded-md border border-border bg-surface px-3 py-2 text-caption text-ink-muted">
              Context: {contextLabel}
            </p>
          )}

          <div className="rounded-lg bg-[#0b141a] px-4 py-3">
            <p className="text-meta uppercase tracking-[0.06em] text-[#8696a0]">
              Prototype conversation
            </p>
            <div className="mt-3 max-w-[90%] rounded-lg rounded-tl-sm bg-[#005c4b] px-3 py-2 text-small text-ink">
              {copy.prompt}
            </div>
            <div className="mt-2 ml-auto max-w-[90%] rounded-lg rounded-tr-sm bg-[#202c33] px-3 py-2 text-small text-ink">
              Karibu. I can help you {copy.steps[step]?.toLowerCase() ?? "continue"}.
              This prototype will later connect to live WhatsApp.
            </div>
          </div>

          <ol className="space-y-2">
            {copy.steps.map((s, i) => (
              <li
                key={s}
                className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-small ${
                  i === step
                    ? "border-accent/40 bg-accent-soft text-ink"
                    : i < step
                      ? "border-border text-ink-muted"
                      : "border-border/60 text-ink-subtle"
                }`}
              >
                <span className="font-mono text-caption text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>

        <footer className="space-y-2 border-t border-border px-5 py-4">
          {step < copy.steps.length - 1 ? (
            <Button fullWidth type="button" onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button
              fullWidth
              type="button"
              href={FAIDA_WHATSAPP_URL}
              className="bg-[#25D366] text-ink-inverse shadow-none hover:bg-[#20bd5c]"
            >
              Open WhatsApp
            </Button>
          )}
          <Button fullWidth type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  );
}
