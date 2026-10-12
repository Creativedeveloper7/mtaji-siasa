"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { apiJson } from "@/lib/api-client";
import { COUNTIES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { ApplicationView, Opportunity } from "@/types";

const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 text-small text-ink placeholder:text-ink-subtle transition-colors hover:border-border-strong focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30";

export function ApplyModal({
  opportunity,
  open,
  onClose,
  onApplied,
}: {
  opportunity: Opportunity;
  open: boolean;
  onClose: () => void;
  onApplied: (application: ApplicationView) => void;
}) {
  const { user, ready } = useAuth();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<ApplicationView | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Reset only when the modal opens; parents pass a new onClose on every render.
  useEffect(() => {
    if (!open) return;
    setError("");
    setDone(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const next = `/opportunities/${opportunity.slug}?apply=1`;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const message = String(form.get("message") || "").trim();
    if (message.length < 20) {
      setError("Tell the organiser a little about yourself (at least 20 characters).");
      return;
    }
    setSending(true);
    const result = await apiJson<{ item?: ApplicationView; error?: string }>("/api/applications", {
      method: "POST",
      body: JSON.stringify({
        opportunityId: opportunity.id,
        fullName: String(form.get("fullName") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        county: String(form.get("county") || ""),
        message,
        attachmentUrl: String(form.get("attachmentUrl") || ""),
      }),
    });
    setSending(false);
    if (!result.ok || !result.data.item) {
      setError(result.data.error || "Could not send your application. Try again.");
      return;
    }
    setDone(result.data.item);
    onApplied(result.data.item);
  };

  let body: ReactNode;
  if (!ready) {
    body = <p className="text-small text-ink-muted">Loading your account…</p>;
  } else if (!user) {
    body = (
      <div className="space-y-4">
        <p className="text-body text-ink-muted">
          Sign in or create a free account to apply. Your application goes straight to the
          person who published this opportunity, and you can follow its status afterwards.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button href={`/signin?next=${encodeURIComponent(next)}`} fullWidth>
            Sign in to apply
          </Button>
          <Button href={`/signup?next=${encodeURIComponent(next)}`} variant="outline" fullWidth>
            Create an account
          </Button>
        </div>
      </div>
    );
  } else if (done) {
    body = (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />
        <h3 className="text-h3 text-ink">Application sent</h3>
        <p className="text-small text-ink-muted">
          {opportunity.organization || "The organiser"} can now see your application in their
          dashboard. Check back here for status updates.
        </p>
        <Button type="button" onClick={onClose} fullWidth>
          Done
        </Button>
      </div>
    );
  } else {
    body = (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              name="fullName"
              required
              defaultValue={user.fullName}
              autoComplete="name"
              className={`${fieldClass} h-11`}
            />
          </Field>
          <Field label="Phone">
            <input
              name="phone"
              type="tel"
              required
              autoComplete="tel"
              placeholder="07xx xxx xxx"
              className={`${fieldClass} h-11`}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              defaultValue={user.email}
              autoComplete="email"
              className={`${fieldClass} h-11`}
            />
          </Field>
          <Field label="County">
            <select
              name="county"
              defaultValue={opportunity.county}
              className={`${fieldClass} h-11`}
            >
              {COUNTIES.map((county) => (
                <option key={county} value={county}>
                  {county}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Why are you a good fit?">
          <textarea
            name="message"
            required
            minLength={20}
            maxLength={4000}
            placeholder="Your experience, skills, or business details that match this opportunity."
            className={`${fieldClass} min-h-[130px] py-2.5`}
          />
        </Field>
        <Field label="CV / portfolio link (optional)">
          <input
            name="attachmentUrl"
            type="url"
            placeholder="https://drive.google.com/…"
            className={`${fieldClass} h-11`}
          />
        </Field>
        {error && (
          <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" fullWidth disabled={sending}>
          {sending ? "Sending…" : "Submit application"}
        </Button>
        <p className="text-center text-caption text-ink-subtle">
          Only the publisher of this opportunity sees your details.
        </p>
      </form>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-bg/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="apply-title"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-lg border border-border bg-bg-elevated shadow-raised sm:rounded-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="meta-label text-accent">Apply</p>
            <h2 id="apply-title" className="mt-1 text-h3 text-ink">
              {opportunity.title}
            </h2>
            {opportunity.deadline && (
              <p className="mt-1 text-caption text-ink-subtle">
                Closes {formatDate(opportunity.deadline)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{body}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="meta-label">{label}</span>
      {children}
    </label>
  );
}
