"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/auth/AuthProvider";

const WORKSPACE = "/adly/workspace";
const ALLOWED = new Set(["leader", "aspirant", "admin"]);

interface AdlyAuthGateModalProps {
  open: boolean;
  onClose: () => void;
}

export function AdlyAuthGateModal({ open, onClose }: AdlyAuthGateModalProps) {
  const titleId = useId();
  const { user, ready } = useAuth();
  const next = encodeURIComponent(WORKSPACE);
  const canEnter = ready && !!user && ALLOWED.has(user.role);

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

  if (!open) return null;

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
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-t-xl border border-border bg-bg-elevated shadow-raised sm:rounded-xl animate-slide-up">
        <header className="flex items-start justify-between border-b border-border px-5 py-4 md:px-6">
          <div>
            <p className="meta-label text-accent">Adly</p>
            <h2 id={titleId} className="mt-1 text-h3 text-ink">
              Get started with Adly
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
        <div className="space-y-6 px-5 py-6 md:px-6">
          <p className="text-body text-ink-muted">
            {canEnter
              ? "You're signed in. Continue to the Adly workspace, or use another account."
              : "Create an M-Taji Siasa account or sign in to access Adly."}
          </p>
          <div className="flex flex-col gap-3">
            {canEnter && (
              <Button href={WORKSPACE} fullWidth>
                Continue to Adly
              </Button>
            )}
            <Button
              href={`/signup?next=${next}`}
              fullWidth
              variant={canEnter ? "outline" : "primary"}
            >
              Sign Up
            </Button>
            <Button href={`/signin?next=${next}`} variant="outline" fullWidth>
              Sign In
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
