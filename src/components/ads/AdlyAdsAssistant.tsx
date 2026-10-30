"use client";

import Link from "next/link";
import { ArrowUpRight, Clapperboard, ImageIcon, LayoutDashboard, Sparkles, Wand2 } from "lucide-react";
import { AdminDrawer, AdminSelect } from "@/components/admin/AdminUI";
import { AdlyCampaignLive } from "@/components/adly/AdlyCampaignLive";
import { AD_STATUS } from "@/components/ads/AdCampaignCard";
import { Button } from "@/components/ui/Button";
import type { AdCampaign } from "@/types";

/**
 * Adly as a helper on the dashboard Ads page. It reuses the Adly campaign tools
 * as they are (AdlyCampaignLive: chat, recommendations, network results,
 * publish) for one ad at a time, in a side panel. Dashboard ads and Adly
 * campaigns are the same Tracker campaign records, so no data is copied.
 */
export function AdlyAdsAssistant({
  open,
  campaigns,
  campaignId,
  onSelect,
  onClose,
  onChanged,
}: {
  open: boolean;
  campaigns: AdCampaign[];
  /** The ad Adly is working on; null shows the picker */
  campaignId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  /** After Adly publishes or refreshes results, so the ads list reloads */
  onChanged: () => void;
}) {
  const selected = campaigns.find((c) => c.id === campaignId);

  return (
    <AdminDrawer open={open} title="Adly assistant" onClose={onClose}>
      <div className="space-y-5">
        <p className="text-small text-ink-muted">
          Adly helps you get an ad ready: targeting, channels, copy and a policy check, then publishing and results.
          Suggestions are yours to accept.
        </p>

        {campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
            <p className="text-small text-ink-muted">
              Create an ad first. Adly then works with you on that ad.
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-4" onClick={onClose}>
              Back to the ad composer
            </Button>
          </div>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="meta-label">Which ad?</span>
              <AdminSelect value={campaignId ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
                <option value="">Choose one of your ads</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {AD_STATUS[c.status]?.label ?? c.status}
                  </option>
                ))}
              </AdminSelect>
            </label>

            {selected ? (
              <>
                <Link
                  href={`/adly/advertising/${encodeURIComponent(selected.id)}`}
                  className="inline-flex items-center gap-1.5 text-caption font-medium text-accent hover:text-accent-hover"
                >
                  Open this ad in the full Adly workspace
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                {/* key: a fresh chat and results for each ad */}
                <AdlyCampaignLive
                  key={selected.id}
                  campaignId={selected.id}
                  ad={selected}
                  onChanged={onChanged}
                  fallback={
                    <p className="rounded-md border border-border bg-surface px-3 py-3 text-small text-ink-muted">
                      Chatting with Adly needs the M-Taji Tracker backend, which is not connected on this server.
                    </p>
                  }
                />
              </>
            ) : (
              <p className="text-caption text-ink-subtle">Pick an ad above to chat with Adly about it.</p>
            )}
          </>
        )}
      </div>
    </AdminDrawer>
  );
}

const TOOLS = [
  { href: "/adly/poster", label: "Campaign poster", icon: ImageIcon },
  { href: "/adly/timelapse", label: "Project timelapse", icon: Clapperboard },
  { href: "/adly/simulate", label: "Before / after simulation", icon: Wand2 },
  { href: "/adly/workspace", label: "Adly workspace", icon: LayoutDashboard },
];

/** Small box beside the composer pointing to Adly. */
export function AdlyHelpCard({ onAsk, hasAds }: { onAsk: () => void; hasAds: boolean }) {
  return (
    <section className="rounded-lg border border-border-accent bg-accent-soft p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-small font-medium text-ink">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        Adly can help
      </h2>
      <p className="mt-2 text-caption text-ink-muted">
        {hasAds
          ? "Ask Adly to review an ad's targeting and copy, check it against ad policies, publish it and track results."
          : "Once your first ad is created, Adly can review its targeting and copy, publish it and track results."}
      </p>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onAsk}>
        <Sparkles className="h-4 w-4" />
        Ask Adly
      </Button>
      <p className="meta-label mt-4">More Adly tools</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {TOOLS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-[40px] items-center gap-2 rounded-md border border-border bg-bg-elevated/60 px-3 text-caption text-ink transition-colors hover:border-accent/50"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
