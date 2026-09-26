"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Clapperboard,
  Megaphone,
  Sparkles,
  Wand2,
  ArrowRight,
} from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminUI";
import { AdlyStat } from "@/components/adly/AdlyUI";
import { useAdly } from "@/components/adly/AdlyProvider";
import { useOwnedLeaderScope } from "@/components/adly/useOwnedLeaderScope";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { computeAdlyStats } from "@/data/adly";
import type { AdlyContent } from "@/types/adly";

const capabilities = [
  {
    href: "/adly/advertising",
    icon: Megaphone,
    label: "Advertise",
    title: "Advertising assistance",
    body: "Create, review, monitor and optimize campaign advertising.",
  },
  {
    href: "/adly/poster",
    icon: Wand2,
    label: "Create posters",
    title: "Political poster creation",
    body: "Generate campaign-ready political and development posters.",
  },
  {
    href: "/adly/timelapse",
    icon: Clapperboard,
    label: "Timelapse",
    title: "Development project timelapse",
    body: "Turn timestamped project media into development progress stories.",
  },
  {
    href: "/adly/simulate",
    icon: Sparkles,
    label: "Simulate",
    title: "AI development simulations",
    body: "Turn manifesto ideas into AI-powered development visualizations.",
  },
];

export default function AdlyHomePage() {
  const { ready, content } = useAdly();
  const { leaderId, isAdmin, displayName } = useOwnedLeaderScope();

  const scoped = useMemo(() => {
    if (isAdmin || !leaderId) return content;
    const campaigns = content.campaigns.filter((c) => c.leaderId === leaderId);
    const campaignIds = new Set(campaigns.map((c) => c.id));
    const creativeIds = new Set(campaigns.flatMap((c) => c.creativeIds));
    return {
      ...content,
      campaigns,
      creatives: content.creatives.filter((c) => creativeIds.has(c.id)),
      policyReviews: content.policyReviews.filter(
        (p) =>
          campaignIds.has(p.campaignId) ||
          campaigns.some((c) => c.policyReviewId === p.id)
      ),
      posters: content.posters.filter((p) => p.leaderId === leaderId),
      simulations: content.simulations.filter((s) => s.leaderId === leaderId),
      insights: content.insights.filter(
        (i) =>
          !i.relatedCampaignId || campaignIds.has(i.relatedCampaignId)
      ),
    } satisfies AdlyContent;
  }, [content, isAdmin, leaderId]);

  const stats = useMemo(() => computeAdlyStats(scoped), [scoped]);

  if (!ready) return <LoadingState label="Loading workspace…" />;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-xl border border-border bg-bg-elevated px-6 py-10 md:px-10 md:py-14">
        <div className="pointer-events-none absolute inset-0 bg-grid-subtle opacity-60" />
        <div className="relative max-w-2xl">
          <p className="meta-label text-accent">Adly</p>
          <h1 className="mt-3 text-display text-ink">
            Meet <span className="editorial-serif italic text-accent">Adly.</span>
          </h1>
          <p className="mt-4 text-body text-ink-muted">
            Your AI-powered campaign and development storytelling assistant.
          </p>
          <p className="mt-2 text-small text-ink-subtle">
            Create. Visualize. Advertise. Measure.
            {!isAdmin && displayName ? ` · Working as ${displayName}` : ""}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/adly/advertising">Start a campaign</Button>
            <Button href="/adly/simulate" variant="outline">
              Visualize a proposal
            </Button>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5">
          <h2 className="text-h2 text-ink">Capabilities</h2>
          <p className="mt-2 text-small text-ink-muted">
            Four studios — connected into one campaign workflow.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <Link
                key={cap.href}
                href={cap.href}
                className="group flex flex-col rounded-lg border border-border bg-surface p-6 transition-colors hover:border-border-strong"
              >
                <span className="meta-label text-accent">{cap.label}</span>
                <div className="mt-4 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-bg-elevated text-accent">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-h3 text-ink group-hover:text-accent transition-colors">
                      {cap.title}
                    </h3>
                    <p className="mt-2 text-small text-ink-muted">{cap.body}</p>
                  </div>
                </div>
                <span className="mt-6 inline-flex items-center gap-1 text-small text-accent">
                  Open studio <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <AdminHeader
          title="Campaign overview"
          description="Operational metrics across your Adly workspace — you remain in control of every publish decision."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdlyStat label="Active campaigns" value={String(stats.activeCampaigns)} />
          <AdlyStat
            label="Ad spend"
            value={formatCurrency(stats.totalSpend, stats.currency)}
          />
          <AdlyStat label="Reach" value={stats.reach.toLocaleString()} />
          <AdlyStat
            label="Impressions"
            value={stats.impressions.toLocaleString()}
          />
          <AdlyStat
            label="Engagement"
            value={stats.engagement.toLocaleString()}
          />
          <AdlyStat label="Avg CTR" value={`${stats.avgCtr}%`} />
          <AdlyStat
            label="Desired actions"
            value={stats.conversions.toLocaleString()}
            hint="Clicks / form intents tracked in mock performance"
          />
          <AdlyStat
            label="Policy review"
            value={String(stats.policyAttentionCount)}
            hint="Items needing human review — not platform guarantees"
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h3 className="text-h3 text-ink">Active & recent campaigns</h3>
            <Link
              href="/adly/advertising"
              className="text-small text-accent hover:text-accent-hover"
            >
              Manage all
            </Link>
          </div>
          <ul className="space-y-3">
            {scoped.campaigns.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/adly/advertising/${c.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-4 transition-colors hover:border-border-strong"
                >
                  <div>
                    <p className="text-small font-medium text-ink">{c.name}</p>
                    <p className="mt-1 text-caption text-ink-subtle">
                      {c.targeting.county || c.targeting.country} ·{" "}
                      {formatCurrency(c.performance.spend, c.currency)} spent
                    </p>
                  </div>
                  <StatusBadge
                    status={c.status.replace("-", " ")}
                    tone={
                      c.status === "active"
                        ? "success"
                        : c.status === "in-review"
                          ? "warning"
                          : "neutral"
                    }
                    pulse={c.status === "active"}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-2">
          <h3 className="mb-4 text-h3 text-ink">Adly Insights</h3>
          <ul className="space-y-3">
            {scoped.insights.map((ins) => (
              <li
                key={ins.id}
                className={cn(
                  "rounded-lg border p-4",
                  ins.tone === "positive" &&
                    "border-success/25 bg-success-muted/30",
                  ins.tone === "attention" &&
                    "border-warning/25 bg-warning-muted/30",
                  ins.tone === "neutral" && "border-border bg-surface"
                )}
              >
                <p className="text-small font-medium text-ink">{ins.title}</p>
                <p className="mt-2 text-caption text-ink-muted">{ins.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-border-accent bg-accent-soft p-6 md:p-8">
        <p className="meta-label text-accent">Cross-feature workflow</p>
        <h3 className="mt-2 text-h3 text-ink">Connect the studios</h3>
        <p className="mt-2 max-w-2xl text-small text-ink-muted">
          Project → Timelapse → Poster → Advertising → Monitoring. Or Manifesto →
          Simulation → Poster → Campaign. Adly keeps the hand-offs obvious.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button href="/adly/timelapse" size="sm" variant="outline">
            Timelapse
          </Button>
          <Button href="/adly/poster" size="sm" variant="outline">
            Poster
          </Button>
          <Button href="/adly/advertising" size="sm" variant="outline">
            Advertise
          </Button>
          <Button href="/adly/simulate" size="sm">
            Simulate
          </Button>
        </div>
      </section>
    </div>
  );
}
