"use client";

import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AdCampaign, AdCampaignStatus, AdPlatformRun } from "@/types";

export const AD_STATUS: Record<AdCampaignStatus, { label: string; tone: "neutral" | "success" | "warning" | "accent" | "error" }> = {
  pending_approval: { label: "Awaiting approval", tone: "warning" },
  launching: { label: "Publishing", tone: "accent" },
  active: { label: "Running", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "neutral" },
  failed: { label: "Failed", tone: "error" },
  rejected: { label: "Not published", tone: "error" },
  stopped: { label: "Stopped", tone: "neutral" },
};

const RUN_LABEL: Record<AdPlatformRun["status"], string> = {
  pending: "Waiting",
  live: "Live",
  paused: "Paused",
  failed: "Failed",
  ended: "Ended",
};

export type AdCardAction = "approve" | "reject" | "publish" | "pause" | "resume" | "stop" | "sync";

/** What this backend can do to a running ad. The Tracker backend has no pause/stop yet. */
export interface AdCardControls {
  pause: boolean;
  resume: boolean;
  stop: boolean;
}

const ALL_CONTROLS: AdCardControls = { pause: true, resume: true, stop: true };

const number = (n?: number) => (n ?? 0).toLocaleString();

export function AdCampaignCard({
  campaign,
  busy,
  admin = false,
  owner,
  controls = ALL_CONTROLS,
  approvalPublishes = true,
  onAction,
}: {
  campaign: AdCampaign;
  busy?: AdCardAction | null;
  admin?: boolean;
  /** Shown to admins: who the ad is for */
  owner?: string;
  controls?: AdCardControls;
  /** Legacy store: approving publishes. Tracker: approving lets the owner publish. */
  approvalPublishes?: boolean;
  onAction: (action: AdCardAction) => void;
}) {
  const status = AD_STATUS[campaign.status];
  const running = campaign.status === "active" || campaign.status === "paused";
  const spent = campaign.platforms.reduce((sum, r) => sum + (r.spentKes ?? 0), 0);
  const impressions = campaign.platforms.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
  const clicks = campaign.platforms.reduce((sum, r) => sum + (r.clicks ?? 0), 0);

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={campaign.imageUrl}
          alt=""
          className="aspect-[1.91/1] w-full shrink-0 rounded-md object-cover sm:w-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-small font-medium text-ink">{campaign.name}</p>
              <p className="text-caption text-ink-subtle">
                {owner ? `${owner} · ` : ""}Created {formatDate(campaign.createdAt)}
                {campaign.startDate && campaign.endDate
                  ? ` · Runs ${formatDate(campaign.startDate)} – ${formatDate(campaign.endDate)}`
                  : ` · ${campaign.durationDays} day${campaign.durationDays === 1 ? "" : "s"}`}
              </p>
            </div>
            <StatusBadge status={status.label} tone={status.tone} pulse={campaign.status === "active"} />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-caption sm:grid-cols-4">
            <Stat label="Budget" value={formatCurrency(campaign.budgetKes)} />
            <Stat label="Est. reach" value={`~${number(campaign.estimatedReach)}`} />
            <Stat label="Impressions" value={number(impressions)} />
            <Stat label="Clicks" value={number(clicks)} />
            {spent > 0 && <Stat label="Spent" value={formatCurrency(Math.round(spent))} />}
            {campaign.refundedKes > 0 && <Stat label="Refunded" value={formatCurrency(campaign.refundedKes)} />}
          </dl>

          {campaign.statusNote && <p className="mt-3 text-caption text-ink-muted">{campaign.statusNote}</p>}

          <ul className="mt-3 space-y-1.5">
            {campaign.platforms.map((run) => (
              <li key={run.platform} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                <span className="w-14 font-medium text-ink">{run.platform === "x" ? "X" : "Google"}</span>
                <span className={run.status === "failed" ? "text-error" : run.status === "live" ? "text-success" : "text-ink-muted"}>
                  {RUN_LABEL[run.status]}
                </span>
                <span className="text-ink-subtle">{formatCurrency(run.budgetKes)}</span>
                {run.error && (
                  <span className="flex w-full items-start gap-1 text-error">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span className="break-words">{run.error}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          {admin && (
            <details className="mt-3 text-caption text-ink-muted">
              <summary className="cursor-pointer text-ink">Ad copy & keywords</summary>
              <p className="mt-2 font-medium text-ink">{campaign.headline}</p>
              <p className="mt-1 whitespace-pre-wrap">{campaign.body}</p>
              <p className="mt-2">Keywords: {campaign.keywords.join(", ")}</p>
              <a href={campaign.landingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-accent">
                {campaign.landingUrl} <ExternalLink className="h-3 w-3" />
              </a>
            </details>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-bg-elevated px-4 py-3">
        {campaign.status === "pending_approval" && admin && (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => onAction("reject")}>
              {busy === "reject" ? "Rejecting…" : approvalPublishes ? "Reject & refund" : "Reject"}
            </Button>
            <Button type="button" size="sm" disabled={!!busy} onClick={() => onAction("approve")}>
              {busy === "approve" ? (approvalPublishes ? "Publishing…" : "Approving…") : approvalPublishes ? "Approve & publish" : "Approve"}
            </Button>
          </>
        )}
        {campaign.status === "pending_approval" && !admin && (
          <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => onAction("reject")}>
            {busy === "reject" ? "Cancelling…" : approvalPublishes ? "Cancel & refund" : "Cancel"}
          </Button>
        )}
        {campaign.status === "launching" && !admin && !approvalPublishes && (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => onAction("reject")}>
              {busy === "reject" ? "Cancelling…" : "Cancel"}
            </Button>
            <Button type="button" size="sm" disabled={!!busy} onClick={() => onAction("publish")}>
              {busy === "publish" ? "Publishing…" : "Publish now"}
            </Button>
          </>
        )}
        {running && (
          <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={() => onAction("sync")}>
            <RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
            Refresh results
          </Button>
        )}
        {campaign.status === "active" && controls.pause && (
          <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => onAction("pause")}>
            {busy === "pause" ? "Pausing…" : "Pause"}
          </Button>
        )}
        {campaign.status === "paused" && controls.resume && (
          <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => onAction("resume")}>
            {busy === "resume" ? "Resuming…" : "Resume"}
          </Button>
        )}
        {running && controls.stop && (
          <Button type="button" size="sm" variant="danger" disabled={!!busy} onClick={() => onAction("stop")}>
            {busy === "stop" ? "Stopping…" : "Stop & refund unspent"}
          </Button>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}
