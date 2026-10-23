"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useAdly } from "@/components/adly/AdlyProvider";

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

/** Event the floating assistant sends to a campaign's chat with a suggested question. */
export const ADLY_ASK_EVENT = "adly:ask";
export const ADLY_CHAT_ID = "adly-chat";
export const ADLY_CHAT_INPUT_ID = "adly-chat-input";

/**
 * Floating "Ask Adly". Adly (the Tracker's adly-agent) answers inside a
 * campaign, so on a campaign page this hands a question to that campaign's
 * chat; elsewhere it lists the user's campaigns to open a chat with.
 */
export function AdlyAssistant({
  context = "home",
  campaignId,
  className,
}: {
  context?: keyof typeof PROMPTS;
  campaignId?: string;
  className?: string;
}) {
  const { ready, backend, content } = useAdly();
  const [open, setOpen] = useState(false);
  const prompts = PROMPTS[context] || PROMPTS.home;
  const campaigns = useMemo(
    () => [...content.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [content.campaigns]
  );

  const askInChat = (prompt?: string) => {
    const chat = document.getElementById(ADLY_CHAT_ID);
    if (!chat) return;
    if (prompt) window.dispatchEvent(new CustomEvent(ADLY_ASK_EVENT, { detail: prompt }));
    chat.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => document.getElementById(ADLY_CHAT_INPUT_ID)?.focus(), 300);
    setOpen(false);
  };

  // On a campaign page with a live chat, the button goes straight to it.
  const hasChat = Boolean(campaignId) && backend === "tracker";

  return (
    <div className={cn("fixed bottom-5 right-5 z-40", className)}>
      {open && (
        <div className="mb-3 w-[min(100vw-2rem,340px)] overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-raised animate-slide-up">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="meta-label text-accent">Adly assistant</p>
              <p className="mt-1 text-caption text-ink-muted">
                {hasChat ? "Pick a question to send to Adly" : "Adly answers inside a campaign"}
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
            {hasChat ? (
              <>
                {prompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => askInChat(p)}
                    className="block w-full rounded-md border border-border bg-surface px-3 py-2.5 text-left text-small text-ink transition-colors hover:border-border-strong"
                  >
                    {p}
                  </button>
                ))}
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => askInChat()}>
                  Write my own question
                </Button>
              </>
            ) : !ready ? (
              <p className="text-caption text-ink-subtle">Loading your campaigns…</p>
            ) : backend !== "tracker" ? (
              <p className="text-caption text-ink-muted">
                Chatting with Adly needs the M-Taji Tracker backend, which is not connected on this server.
              </p>
            ) : (
              <>
                {campaigns.length > 0 ? (
                  <>
                    <p className="text-caption text-ink-muted">Open a campaign to chat with Adly about it:</p>
                    {campaigns.map((c) => (
                      <Link
                        key={c.id}
                        href={`/adly/advertising/${encodeURIComponent(c.id)}#${ADLY_CHAT_ID}`}
                        onClick={() => setOpen(false)}
                        className="block w-full truncate rounded-md border border-border bg-surface px-3 py-2.5 text-left text-small text-ink transition-colors hover:border-border-strong"
                      >
                        {c.name}
                      </Link>
                    ))}
                  </>
                ) : (
                  <p className="text-caption text-ink-muted">
                    You have no campaigns yet. Plan one and Adly can help with targeting, channels and copy.
                  </p>
                )}
                <Button href="/adly/advertising" size="sm" variant="outline" className="w-full">
                  Plan a new campaign
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="shadow-raised"
        aria-expanded={open}
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
