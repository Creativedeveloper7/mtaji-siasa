"use client";

import { useEffect, useId, useState } from "react";
import Image from "next/image";
import { X, Heart, Users, HandHeart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FaidaCTA } from "@/components/faida/FaidaCTA";
import type { FaidaIntent } from "@/components/faida/FaidaProvider";

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
  leaderName: string;
  /** "Donate": opens the Paystack donation form for this leader (see engagement/Donation). */
  onDonate: () => void;
}

type SupportOption = {
  id: "donate" | "movement" | "volunteer";
  title: string;
  description: string;
  intent: FaidaIntent;
  icon: typeof Heart;
};

const options: SupportOption[] = [
  {
    id: "donate",
    title: "Donate",
    description: "Give with M-Pesa or card through Paystack's secure checkout.",
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

/**
 * "Support" on a leader's profile: donate (the real Paystack form), or join
 * or volunteer through Faida on WhatsApp.
 */
export function SupportModal({ open, onClose, leaderName, onDonate }: SupportModalProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<SupportOption["id"] | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
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

  const choose = (id: SupportOption["id"]) => {
    if (id === "donate") {
      onDonate();
      return;
    }
    setSelected(id);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-bg/80 backdrop-blur-sm" aria-label="Close dialog" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-bg-elevated shadow-raised sm:rounded-xl animate-slide-up">
        <header className="flex items-start justify-between border-b border-border px-5 py-4 md:px-6">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 h-9 w-9 shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-border">
              <Image src="/mtaji-logo.png" alt="" width={36} height={36} className="h-full w-full object-cover" />
            </span>
            <div>
              <p className="meta-label">Engagement</p>
              <h2 id={titleId} className="mt-1 text-h3 text-ink">
                Support {leaderName}
              </h2>
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
          <div className="space-y-3">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isActive = selected === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => choose(opt.id)}
                  className={`flex w-full items-start gap-4 rounded-lg border px-4 py-4 text-left transition-colors ${
                    isActive ? "border-accent/40 bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                      opt.id === "donate"
                        ? "border-accent/30 bg-accent/10 text-accent"
                        : opt.id === "volunteer"
                          ? "border-brand-green/30 bg-brand-green/10 text-brand-green"
                          : "border-border bg-bg text-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-small font-medium text-ink">{opt.title}</span>
                    <span className="mt-1 block text-small text-ink-muted">{opt.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <footer className="border-t border-border px-5 py-4 md:px-6">
          {active ? (
            <div className="space-y-3">
              <p className="text-small text-ink-muted">Primary action continues through Faida on WhatsApp.</p>
              <FaidaCTA intent={active.intent} contextLabel={`${active.title} · ${leaderName}`} fullWidth label="Continue with Faida" />
            </div>
          ) : (
            <Button fullWidth type="button" variant="secondary" disabled>
              Select an option to continue
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
