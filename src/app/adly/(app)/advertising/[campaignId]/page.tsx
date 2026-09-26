"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminUI";
import { AdlyStat, PolicyStatusBadge } from "@/components/adly/AdlyUI";
import { useAdly } from "@/components/adly/AdlyProvider";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SafeImage } from "@/components/ui/SafeImage";
import { LoadingState } from "@/components/ui/EmptyState";
import { formatCurrency, cn } from "@/lib/utils";
import { getAdPlatformName } from "@/data/adly";

export default function AdlyCampaignMonitorPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const { ready, content, getCampaign } = useAdly();
  const campaign = getCampaign(campaignId);

  const creatives = useMemo(
    () =>
      campaign
        ? content.creatives.filter((c) => campaign.creativeIds.includes(c.id))
        : [],
    [campaign, content.creatives]
  );

  const review = content.policyReviews.find(
    (p) => p.id === campaign?.policyReviewId || p.campaignId === campaignId
  );

  if (!ready) return <LoadingState />;
  if (!campaign) notFound();

  const perf = campaign.performance;
  const spendPct =
    campaign.budget > 0
      ? Math.min(100, Math.round((perf.spend / campaign.budget) * 100))
      : 0;

  const recommendations = [
    "Creative A is generating stronger engagement where performance data exists.",
    "Consider testing a different headline on underperforming placements.",
    "Spend concentration may be geographic — review county / ward targeting.",
    "Campaign performance has changed over the last 24 hours (mock signal).",
  ];

  return (
    <div className="space-y-10">
      <AdminHeader
        title={campaign.name}
        description="Campaign monitoring — Adly recommends operational improvements. You decide what to change."
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              status={campaign.status.replace("-", " ")}
              tone={campaign.status === "active" ? "success" : "warning"}
              pulse={campaign.status === "active"}
            />
            <Button href="/adly/advertising" variant="outline" size="sm">
              Back
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdlyStat
          label="Budget"
          value={formatCurrency(campaign.budget, campaign.currency)}
        />
        <AdlyStat
          label="Spend"
          value={formatCurrency(perf.spend, campaign.currency)}
          hint={`${spendPct}% of budget`}
        />
        <AdlyStat label="Reach" value={perf.reach.toLocaleString()} />
        <AdlyStat label="Impressions" value={perf.impressions.toLocaleString()} />
        <AdlyStat label="Engagement" value={perf.engagement.toLocaleString()} />
        <AdlyStat label="CTR" value={`${perf.ctr}%`} />
        <AdlyStat
          label="Desired actions"
          value={perf.conversions.toLocaleString()}
        />
        <AdlyStat
          label="Platforms"
          value={String(campaign.platformIds.length)}
          hint={campaign.platformIds.map(getAdPlatformName).join(" · ")}
        />
      </div>

      <section className="rounded-lg border border-border bg-surface p-5 md:p-6">
        <h2 className="text-h3 text-ink">Spend vs budget</h2>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${spendPct}%` }}
          />
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-7">
          {[12, 28, 35, 48, 55, 62, spendPct].map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="flex h-28 w-full items-end rounded-md bg-bg-elevated p-1">
                <div
                  className="w-full rounded-sm bg-accent/80"
                  style={{ height: `${Math.max(8, v)}%` }}
                />
              </div>
              <span className="text-[10px] text-ink-subtle">D{i + 1}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-caption text-ink-subtle">
          Illustrative daily spend curve for this prototype — not live ad-network data.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-h3 text-ink">Creative performance</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {creatives.map((cr) => (
            <article
              key={cr.id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="relative aspect-[16/10]">
                <SafeImage
                  src={cr.image}
                  alt={cr.name}
                  fill
                  className="object-cover"
                  sizes="50vw"
                />
              </div>
              <div className="p-4">
                <p className="text-small font-medium text-ink">{cr.name}</p>
                <p className="mt-1 text-caption text-ink-muted">{cr.headline}</p>
                {cr.performance && (
                  <p className="mt-3 font-mono text-caption text-accent">
                    CTR {cr.performance.ctr}% ·{" "}
                    {cr.performance.engagement.toLocaleString()} eng ·{" "}
                    {formatCurrency(cr.performance.spend, cr.performance.currency)}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {review && (
        <section className="rounded-lg border border-border bg-surface p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h3 text-ink">Policy review status</h2>
            <PolicyStatusBadge status={review.status} />
          </div>
          <p className="mt-2 text-caption text-ink-subtle">{review.disclaimer}</p>
          <ul className="mt-4 space-y-2">
            {review.checks.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 text-caption"
              >
                <span className="text-ink-muted">{c.label}</span>
                <PolicyStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border-accent bg-accent-soft p-5 md:p-6">
        <h2 className="text-h3 text-ink">Adly Recommendations</h2>
        <p className="mt-2 text-small text-ink-muted">
          Operational and creative suggestions only — Adly does not make political
          persuasion decisions for you.
        </p>
        <ul className="mt-4 space-y-2">
          {recommendations.map((r) => (
            <li
              key={r}
              className={cn(
                "rounded-md border border-border bg-bg-elevated/60 px-3 py-2.5 text-small text-ink-muted"
              )}
            >
              {r}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button href="/adly/poster" size="sm" variant="outline">
            Create poster
          </Button>
          <Button href="/adly/timelapse" size="sm" variant="outline">
            Build timelapse
          </Button>
          <Link
            href="/adly/workspace"
            className="text-small text-accent hover:text-accent-hover self-center"
          >
            Back to overview
          </Link>
        </div>
      </section>
    </div>
  );
}
