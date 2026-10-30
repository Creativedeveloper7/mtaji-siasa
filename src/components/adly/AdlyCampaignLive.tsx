"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw, Send, Sparkles, X } from "lucide-react";
import { AdminTextarea } from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiJson } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { ADLY_ASK_EVENT, ADLY_CHAT_ID, ADLY_CHAT_INPUT_ID } from "@/components/adly/AdlyUI";
import { AdUpdateDialog } from "@/components/ads/AdUpdateDialog";
import type { AdCampaign } from "@/types";

interface Conversation {
  messages: { id: string; role: string; content: string; createdAt: string }[];
  recommendations: {
    id: string;
    channel: string;
    headline: string | null;
    body: string | null;
    status: string;
    kind: string | null;
  }[];
  channels: {
    provider: string;
    impressions: number;
    clicks: number;
    spendKes: number;
    approvalStatus: string;
    syncedAt: string | null;
  }[];
  publishable: string[];
  awaitingApproval: string | null;
  /** Another publish of this campaign is running */
  publishing?: boolean;
  /** Networks that accepted the ad but whose wallet charge failed */
  unpaid?: { provider: string; amountKes: number; at: string }[];
  status: string;
  hasCreative: boolean;
}

const channelName = (c: string) => (c === "x" ? "X" : c === "youtube" ? "YouTube" : c.charAt(0).toUpperCase() + c.slice(1));
const statusLabel = (s: string) =>
  s === "secrets_missing" ? "Not connected" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const statusTone = (s: string): "success" | "warning" | "error" | "neutral" => {
  const v = s.toLowerCase();
  if (["active", "enabled", "serving", "learning", "live"].includes(v)) return "success";
  if (["submitted", "pending", "in_review", "pending_review"].includes(v)) return "warning";
  if (["failed", "rejected", "disapproved", "removed", "sync_error"].includes(v) || v.includes("error")) return "error";
  return "neutral";
};

/**
 * Live Adly tools for one campaign on the M-Taji Tracker: publish to Google
 * and X, network results, Adly recommendations and the Adly chat.
 * Renders `fallback` when the app runs on sample data (no Tracker backend).
 */
export function AdlyCampaignLive({
  campaignId,
  ad,
  fallback,
  onChanged,
}: {
  campaignId: string;
  /** A dashboard ad: "Update on networks" first lets the owner change its audience and budget */
  ad?: AdCampaign;
  fallback?: ReactNode;
  /** Called after publish / sync so the page can reload the campaign */
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<Conversation | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "publish" | "sync" | "chat">("");
  const [message, setMessage] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  /** `isCancelled` lets the mount effect drop an answer that arrives after it was torn down. */
  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    const result = await apiJson<Conversation & { error?: string }>(`/api/adly/agent/${encodeURIComponent(campaignId)}`);
    if (isCancelled()) return;
    if (result.status === 501) {
      setUnavailable(true);
      return;
    }
    if (!result.ok) {
      setError(result.data.error || "Could not load Adly for this campaign.");
      return;
    }
    setError("");
    setData(result.data);
  }, [campaignId]);

  useEffect(() => {
    let cancel = false;
    void load(() => cancel);
    return () => {
      cancel = true;
    };
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [data?.messages.length]);

  // The floating "Ask Adly" button hands its suggested question to this chat.
  useEffect(() => {
    const onAsk = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if (typeof text === "string" && text) setMessage(text);
    };
    window.addEventListener(ADLY_ASK_EVENT, onAsk);
    return () => window.removeEventListener(ADLY_ASK_EVENT, onAsk);
  }, []);

  if (unavailable) return <>{fallback}</>;

  /** `confirmed`: the owner already confirmed in the update dialog. */
  const publish = async (confirmed = false) => {
    if (busy) return;
    if (!confirmed && !confirm("Publish this campaign to the selected networks? Your wallet pays each network that accepts it.")) return;
    setBusy("publish");
    setNotice("");
    const result = await apiJson<{ summary?: string; warnings?: string[]; error?: string }>(`/api/ads/publish/${encodeURIComponent(campaignId)}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setBusy("");
    if (!result.ok && result.status !== 207) {
      setError(result.data.error || "Could not publish.");
      return;
    }
    setError("");
    // Warnings: e.g. a network accepted the ad but the wallet debit failed (unpaid).
    setNotice([result.data.summary || "Sent to the networks.", ...(result.data.warnings ?? [])].join(" "));
    await load();
    onChanged?.();
  };

  const sync = async () => {
    if (busy) return;
    setBusy("sync");
    const result = await apiJson<{ message?: string; error?: string }>(`/api/adly/sync/${encodeURIComponent(campaignId)}`, {
      method: "POST",
    });
    setBusy("");
    if (!result.ok) setError(result.data.error || "Could not refresh results.");
    else if (result.data.message) setNotice(result.data.message);
    await load();
    onChanged?.();
  };

  const send = async () => {
    // Enter can fire while a reply is pending (the textarea stays enabled).
    if (busy) return;
    const text = message.trim();
    if (!text) return;
    setBusy("chat");
    setError("");
    // Show the message right away; the agent stores both turns.
    setData((d) =>
      d ? { ...d, messages: [...d.messages, { id: `local-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() }] } : d
    );
    setMessage("");
    const result = await apiJson<{ reply?: string; error?: string }>(`/api/adly/agent/${encodeURIComponent(campaignId)}`, {
      method: "POST",
      body: JSON.stringify({ message: text }),
    });
    setBusy("");
    if (!result.ok) setError(result.data.error || "Adly could not answer.");
    await load();
  };

  const dismiss = async (id: string) => {
    const result = await apiJson(`/api/adly/agent/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id, status: "dismissed" }),
    });
    if (result.ok) await load();
  };

  const pending = data?.recommendations.filter((r) => r.status === "pending") ?? [];
  const live = data ? ["live", "submitted", "paused", "completed"].includes(data.status) : false;

  return (
    <div className="space-y-10">
      {editing && ad && (
        <AdUpdateDialog
          ad={ad}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void publish(true);
          }}
        />
      )}
      <section className="rounded-lg border border-border bg-surface p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h3 text-ink">Networks</h2>
            <p className="mt-2 text-small text-ink-muted">
              Published through M-Taji to Google Ads and X. Results come from the networks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {live && (
              <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => void sync()}>
                <RefreshCw className={cn("h-4 w-4", busy === "sync" && "animate-spin")} />
                Refresh results
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!!busy || !data || !data.publishable.length || Boolean(data.awaitingApproval) || Boolean(data.publishing)}
              onClick={() => (live && ad ? setEditing(true) : void publish())}
            >
              {busy === "publish" ? "Publishing…" : live ? "Update on networks" : "Publish"}
            </Button>
          </div>
        </div>
        {data?.awaitingApproval && <p className="mt-3 text-caption text-warning">{data.awaitingApproval}</p>}
        {data?.publishing && <p className="mt-3 text-caption text-warning">Publishing is already in progress for this campaign.</p>}
        {data?.unpaid && data.unpaid.length > 0 && (
          <p className="mt-3 rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error" role="alert">
            Unpaid:{" "}
            {data.unpaid.map((u) => `${channelName(u.provider)} KES ${u.amountKes.toLocaleString()}`).join(", ")} — the network
            accepted the ad but your wallet was not charged. Top up; an admin will settle it.
          </p>
        )}
        {data && !data.publishable.length && (
          <p className="mt-3 text-caption text-warning">Choose Google or X for this campaign to publish it.</p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-error/30 bg-error-muted px-3 py-2 text-caption text-error">{error}</p>
        )}
        {notice && (
          <p className="mt-3 rounded-md border border-success/30 bg-success-muted px-3 py-2 text-caption text-success" role="status">
            {notice}
          </p>
        )}
        {data && data.channels.length > 0 && (
          <ul className="mt-5 divide-y divide-border rounded-md border border-border">
            {data.channels.map((c) => (
              <li key={c.provider} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-caption">
                <span className="w-20 font-medium text-ink">{channelName(c.provider)}</span>
                <StatusBadge status={statusLabel(c.approvalStatus)} tone={statusTone(c.approvalStatus)} />
                <span className="font-mono text-ink-muted">{c.impressions.toLocaleString()} impr.</span>
                <span className="font-mono text-ink-muted">{c.clicks.toLocaleString()} clicks</span>
                <span className="font-mono text-ink">{formatCurrency(Math.round(c.spendKes))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id={ADLY_CHAT_ID} className="scroll-mt-6 rounded-lg border border-border-accent bg-accent-soft p-5 md:p-6">
        <h2 className="flex items-center gap-2 text-h3 text-ink">
          <Sparkles className="h-5 w-5 text-accent" aria-hidden />
          Adly
        </h2>
        <p className="mt-2 text-small text-ink-muted">
          Plan targeting, channels and copy with Adly. Suggestions are yours to accept — Adly does not make political
          persuasion decisions for you.
        </p>

        {pending.length > 0 && (
          <ul className="mt-4 space-y-2">
            {pending.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-bg-elevated/60 px-3 py-2.5">
                <div className="min-w-0 text-small">
                  <p className="text-ink">
                    {r.headline || `${channelName(r.channel)} ${r.kind?.replace(/_/g, " ") ?? "suggestion"}`}
                  </p>
                  {r.body && <p className="mt-1 text-caption text-ink-muted">{r.body}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void dismiss(r.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-surface hover:text-ink"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto rounded-md border border-border bg-bg-elevated/60 p-3">
          {!data ? (
            <p className="text-caption text-ink-subtle">Loading…</p>
          ) : data.messages.length === 0 ? (
            <p className="text-caption text-ink-subtle">
              Ask Adly to draft targeting, pick channels or write the ad copy for this campaign.
            </p>
          ) : (
            data.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-small",
                  m.role === "user" ? "ml-auto bg-accent text-ink-inverse" : "border border-border bg-surface text-ink"
                )}
              >
                {m.content}
              </div>
            ))
          )}
          {busy === "chat" && <p className="text-caption text-ink-subtle">Adly is thinking…</p>}
          <div ref={bottom} />
        </div>
        <div className="mt-3 flex items-end gap-2">
          <AdminTextarea
            id={ADLY_CHAT_INPUT_ID}
            aria-label="Message Adly"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message Adly"
            rows={2}
            maxLength={4000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button type="button" size="sm" disabled={busy === "chat" || !message.trim()} onClick={() => void send()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
