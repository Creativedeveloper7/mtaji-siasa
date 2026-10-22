"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader, AdminSelect } from "@/components/admin/AdminUI";
import { AD_STATUS, AdCampaignCard, type AdCardAction, type AdCardControls } from "@/components/ads/AdCampaignCard";
import { useContent } from "@/components/content/ContentProvider";
import { apiJson } from "@/lib/api-client";
import type { AdCampaignStatus } from "@/types";
import type { TrackerAdCampaign as AdCampaign } from "@/server/tracker/adly/mapping";

/** Approve ads before they spend real money, and watch every running campaign. */
export default function AdminAdsPage() {
  const { content } = useContent();
  const [items, setItems] = useState<AdCampaign[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unpaid" | AdCampaignStatus>("pending_approval");
  const [busy, setBusy] = useState<{ id: string; action: AdCardAction } | null>(null);
  // Tracker backend: approving lets the owner publish (the networks need the owner's session).
  const [backend, setBackend] = useState<{ tracker: boolean; controls?: AdCardControls }>({ tracker: false });

  const load = useCallback(async () => {
    const result = await apiJson<{
      items?: AdCampaign[];
      quote?: { backend?: "tracker"; controls?: AdCardControls };
      error?: string;
    }>("/api/ads/campaigns?scope=all");
    setLoading(false);
    if (!result.ok) {
      setError(result.data.error || "Could not load ads.");
      return;
    }
    setItems(result.data.items ?? []);
    setBackend({ tracker: result.data.quote?.backend === "tracker", controls: result.data.quote?.controls });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (campaign: AdCampaign, action: AdCardAction) => {
    let note: string | undefined;
    if (action === "reject") {
      const reason = prompt("Reason for not approving (shown to the leader):");
      if (reason === null) return;
      note = reason;
    }
    if (
      action === "approve" &&
      !confirm(
        backend.tracker
          ? `Approve "${campaign.name}"? The leader can then publish it; their wallet pays the networks.`
          : `Publish "${campaign.name}" on the ad networks? This spends real money.`
      )
    )
      return;
    setBusy({ id: campaign.id, action });
    const result = await apiJson<{ item?: AdCampaign; error?: string }>(`/api/ads/campaigns/${encodeURIComponent(campaign.id)}`, {
      method: "POST",
      body: JSON.stringify({ action, note }),
    });
    setBusy(null);
    if (!result.ok || !result.data.item) {
      alert(result.data.error || "Could not update the ad.");
      return;
    }
    const updated = result.data.item;
    setItems((current) => current.map((c) => (c.id === updated.id ? updated : c)));
  };

  // Waiting for approval includes published campaigns whose edits need a new approval.
  const awaiting = (item: AdCampaign) => item.status === "pending_approval" || Boolean(item.changesPendingReview);
  const unpaid = (item: AdCampaign) => (item.unpaidKes ?? 0) > 0;
  const matches = (item: AdCampaign, f: typeof filter) =>
    f === "all" ? true : f === "unpaid" ? unpaid(item) : f === "pending_approval" ? awaiting(item) : item.status === f;
  const rows = items.filter((item) => matches(item, filter));
  const pending = items.filter(awaiting).length;
  const unpaidCount = items.filter(unpaid).length;
  const leaderName = (id: string) => {
    const leader = content.leaders.find((l) => l.id === id);
    return leader ? `${leader.honorific} ${leader.name}` : id;
  };

  return (
    <div>
      <AdminHeader
        title="Ads"
        description={`Paid campaigns on X and Google. ${pending} waiting for approval.${unpaidCount ? ` ${unpaidCount} unpaid.` : ""}`}
      />
      {unpaidCount > 0 && (
        <p className="mb-4 rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error" role="alert">
          {unpaidCount} campaign{unpaidCount === 1 ? " is" : "s are"} live on a network but unpaid: the wallet charge failed after the
          network accepted the ad. Settle them with the owner; Siasa does not retry the charge.
        </p>
      )}
      <div className="mb-6 max-w-xs">
        <AdminSelect value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by status">
          <option value="all">All campaigns ({items.length})</option>
          <option value="unpaid">Unpaid ({unpaidCount})</option>
          {(Object.keys(AD_STATUS) as AdCampaignStatus[]).map((status) => (
            <option key={status} value={status}>
              {AD_STATUS[status].label} ({items.filter((i) => matches(i, status)).length})
            </option>
          ))}
        </AdminSelect>
      </div>
      {error && <p className="mb-4 rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">{error}</p>}
      {loading ? (
        <p className="text-small text-ink-muted">Loading ads…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-small text-ink-muted">
          Nothing here.
        </p>
      ) : (
        <div className="space-y-4">
          {rows.map((campaign) => (
            <AdCampaignCard
              key={campaign.id}
              campaign={campaign}
              admin
              owner={leaderName(campaign.leaderId)}
              controls={backend.controls}
              approvalPublishes={!backend.tracker}
              busy={busy?.id === campaign.id ? busy.action : null}
              onAction={(action) => void act(campaign, action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
