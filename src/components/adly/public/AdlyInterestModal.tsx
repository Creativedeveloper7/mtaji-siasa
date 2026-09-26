"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

const ROLES = [
  "Politician",
  "Aspirant",
  "Campaign Team",
  "Organization",
  "Other",
] as const;

const INTERESTS = [
  "Advertising",
  "Campaign Posters",
  "Project Timelapses",
  "AI Simulations",
  "Campaign Analytics",
  "Other",
] as const;

const INTEREST_STORAGE_KEY = "mtaji-siasa-adly-interest-v1";

const fieldClass =
  "h-11 w-full rounded-md border border-border bg-surface px-3 text-small text-ink transition-colors hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30";

interface AdlyInterestModalProps {
  open: boolean;
  onClose: () => void;
}

export function AdlyInterestModal({ open, onClose }: AdlyInterestModalProps) {
  const titleId = useId();
  const [done, setDone] = useState(false);
  const [role, setRole] = useState<(typeof ROLES)[number]>("Politician");
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDone(false);
    setRole("Politician");
    setInterests([]);
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

  const toggleInterest = (item: string) => {
    setInterests((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    );
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const entry = {
      fullName: String(form.get("fullName") || ""),
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      organization: String(form.get("organization") || ""),
      role,
      interests,
      createdAt: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(
        localStorage.getItem(INTEREST_STORAGE_KEY) || "[]"
      ) as unknown[];
      localStorage.setItem(
        INTEREST_STORAGE_KEY,
        JSON.stringify([entry, ...existing].slice(0, 50))
      );
    } catch {
      /* ignore */
    }
    setDone(true);
  };

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
          <div>
            <p className="meta-label text-accent">Adly</p>
            <h2 id={titleId} className="mt-1 text-h3 text-ink">
              {done ? "You're on the list." : "Interested in Adly?"}
            </h2>
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

        {done ? (
          <div className="space-y-6 px-5 py-8 md:px-6">
            <p className="text-body text-ink-muted">
              Thank you. The M-Taji team will be in touch.
            </p>
            <Button type="button" fullWidth onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 md:px-6">
              <p className="text-small text-ink-muted">
                Tell us a little about yourself and we&apos;ll help you get
                started.
              </p>
              <label className="block space-y-1.5">
                <span className="meta-label">Full name</span>
                <input
                  name="fullName"
                  required
                  className={fieldClass}
                  autoComplete="name"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="meta-label">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className={fieldClass}
                  autoComplete="email"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="meta-label">Phone number</span>
                <input
                  name="phone"
                  type="tel"
                  required
                  className={fieldClass}
                  autoComplete="tel"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="meta-label">Organization / campaign</span>
                <input name="organization" className={fieldClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="meta-label">Role</span>
                <select
                  className={fieldClass}
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as (typeof ROLES)[number])
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="meta-label">What are you interested in?</legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {INTERESTS.map((item) => (
                    <label
                      key={item}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5 text-small text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={interests.includes(item)}
                        onChange={() => toggleInterest(item)}
                        className="accent-[rgb(var(--color-accent))]"
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <footer className="border-t border-border px-5 py-4 md:px-6">
              <Button type="submit" fullWidth>
                Submit Interest
              </Button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
