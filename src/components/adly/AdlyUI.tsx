"use client";

import { useState, type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

const PROMPTS: Record<string, string[]> = {
  home: [
    "Summarise campaign performance this week.",
    "Which creatives need a refresh?",
    "What should I publish next?",
  ],
  advertising: [
    "Review this campaign for policy risks.",
    "Suggest a clearer headline.",
    "Is geographic targeting too narrow?",
  ],
  poster: [
    "Help me create this poster.",
    "Tighten the headline for mobile.",
    "Suggest a stronger CTA.",
  ],
  timelapse: [
    "Help me tell this project's story.",
    "Order these frames for clarity.",
    "Draft captions for each milestone.",
  ],
  simulate: [
    "Help visualize this manifesto proposal.",
    "Keep AI simulation labelling clear.",
    "Suggest a before/after caption.",
  ],
};

export function AdlyAssistant({
  context = "home",
  className,
}: {
  context?: keyof typeof PROMPTS;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const prompts = PROMPTS[context] || PROMPTS.home;

  const ask = (prompt: string) => {
    setReply(
      `Adly note — ${prompt} You stay in control: review any suggestion before publishing. Adly does not guarantee platform approval or fabricate completed development.`
    );
  };

  return (
    <div className={cn("fixed bottom-5 right-5 z-40", className)}>
      {open && (
        <div className="mb-3 w-[min(100vw-2rem,340px)] overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-raised animate-slide-up">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="meta-label text-accent">Adly assistant</p>
              <p className="mt-1 text-caption text-ink-muted">
                Contextual creative help
              </p>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface hover:text-ink"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 p-4">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => ask(p)}
                className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-left text-small text-ink transition-colors hover:border-border-strong"
              >
                {p}
              </button>
            ))}
            {reply && (
              <p className="mt-3 rounded-md border border-border-accent bg-accent-soft p-3 text-caption text-ink-muted">
                {reply}
              </p>
            )}
          </div>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="shadow-raised"
      >
        <Sparkles className="h-4 w-4" />
        Ask Adly
      </Button>
    </div>
  );
}

export function AdlyStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="meta-label">{label}</p>
      <p className="mt-3 font-mono text-h2 text-accent">{value}</p>
      {hint && <p className="mt-2 text-caption text-ink-subtle">{hint}</p>}
    </div>
  );
}

export function AdlyStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 md:p-6">
      <p className="meta-label text-accent">Step {String(n).padStart(2, "0")}</p>
      <h2 className="mt-2 text-h3 text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function PolicyStatusBadge({
  status,
}: {
  status: "passed" | "review" | "needs-attention";
}) {
  const map = {
    passed: { label: "PASSED", className: "border-success/30 bg-success-muted text-success" },
    review: { label: "REVIEW", className: "border-warning/30 bg-warning-muted text-warning" },
    "needs-attention": {
      label: "NEEDS ATTENTION",
      className: "border-error/30 bg-error-muted text-error",
    },
  } as const;
  const s = map[status];
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-2 py-1 text-meta uppercase tracking-[0.06em]",
        s.className
      )}
    >
      {s.label}
    </span>
  );
}
