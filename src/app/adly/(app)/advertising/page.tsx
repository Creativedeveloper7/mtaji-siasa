"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminUI";
import {
  AdminField,
  AdminInput,
  AdminSelect,
  AdminTextarea,
} from "@/components/admin/AdminUI";
import { AdlyStep, PolicyStatusBadge } from "@/components/adly/AdlyUI";
import { OwnedLeaderField } from "@/components/adly/OwnedLeaderField";
import { useOwnedLeaderScope } from "@/components/adly/useOwnedLeaderScope";
import { useAdly } from "@/components/adly/AdlyProvider";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ImageField } from "@/components/ui/ImageField";
import {
  AD_PLATFORMS,
  CAMPAIGN_OBJECTIVES,
  getAdPlatformName,
  isAdPlatformAvailable,
} from "@/data/adly";
import { mockPolicyReviewService, mockAdsPlatformService } from "@/lib/services/adly";
import { createId, slugify } from "@/lib/store";
import { COUNTIES } from "@/lib/constants";
import { formatCurrency, cn } from "@/lib/utils";
import type {
  AdPlatformId,
  Campaign,
  CampaignObjective,
} from "@/types/adly";

export default function AdlyAdvertisingPage() {
  const { content, upsertCampaign, upsertCreative, upsertPolicyReview } = useAdly();
  const {
    leaders,
    leaderId: ownedLeaderId,
    projects,
    isAdmin,
  } = useOwnedLeaderScope();
  const [objective, setObjective] = useState<CampaignObjective>("project-visibility");
  const [platforms, setPlatforms] = useState<AdPlatformId[]>(["google", "x"]);
  const [name, setName] = useState("");
  const [leaderId, setLeaderId] = useState(ownedLeaderId);
  const [projectId, setProjectId] = useState("");
  const [county, setCounty] = useState("Kiambu");
  const [constituency, setConstituency] = useState("");
  const [ward, setWard] = useState("");
  const [audience, setAudience] = useState("Residents interested in local development");
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2026-11-30");
  const [budget, setBudget] = useState(50000);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("See the work");
  const [image, setImage] = useState(
    "https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80"
  );
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ownedLeaderId) setLeaderId(ownedLeaderId);
  }, [ownedLeaderId]);

  const scopedProjects = useMemo(() => {
    if (!leaderId) return [];
    const profile = leaders.find((l) => l.id === leaderId);
    if (!profile) return [];
    const owned = new Set(profile.projectIds);
    return projects.filter((p) => owned.has(p.id));
  }, [leaderId, leaders, projects]);

  const myCampaigns = useMemo(() => {
    if (isAdmin) return content.campaigns;
    if (!leaderId) return [];
    return content.campaigns.filter((c) => c.leaderId === leaderId);
  }, [content.campaigns, isAdmin, leaderId]);

  const myReviews = useMemo(() => {
    if (isAdmin) return content.policyReviews;
    const ids = new Set(myCampaigns.map((c) => c.id));
    return content.policyReviews.filter(
      (r) => ids.has(r.campaignId) || myCampaigns.some((c) => c.policyReviewId === r.id)
    );
  }, [content.policyReviews, isAdmin, myCampaigns]);

  const togglePlatform = (id: AdPlatformId) => {
    if (!isAdPlatformAvailable(id)) return;
    setPlatforms((prev) => {
      const next = prev.includes(id)
        ? prev.filter((p) => p !== id)
        : [...prev, id];
      return next.filter(isAdPlatformAvailable);
    });
  };

  const createCampaign = async () => {
    const selected = platforms.filter(isAdPlatformAvailable);
    if (!name.trim() || !selected.length || !leaderId) return;
    setBusy(true);
    const creativeId = createId("cr");
    const campaignId = createId("cmp");
    const creative = {
      id: creativeId,
      name: `${name} creative`,
      headline: headline || name,
      body: body || audience,
      cta,
      image,
      platformIds: selected,
    };
    await upsertCreative(creative);

    const draft: Campaign = {
      id: campaignId,
      slug: slugify(name) || campaignId,
      name,
      objective,
      status: "in-review",
      platformIds: selected,
      leaderId,
      projectId: projectId || undefined,
      targeting: {
        country: "Kenya",
        county,
        constituency: constituency || undefined,
        ward: ward || undefined,
      },
      startDate,
      endDate,
      budget,
      currency: "KES",
      creativeIds: [creativeId],
      performance: {
        spend: 0,
        reach: 0,
        impressions: 0,
        engagement: 0,
        ctr: 0,
        conversions: 0,
        currency: "KES",
      },
      createdAt: new Date().toISOString(),
    };

    const review = await mockPolicyReviewService.review(draft);
    await upsertCampaign(draft);
    await upsertPolicyReview(review);
    const submit = await mockAdsPlatformService.submitForReview(campaignId);
    setReviewNote(submit.note);
    setBusy(false);
  };

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Advertise with Adly"
        description="Create, review, monitor and optimize your campaign. Adly assists — final approval is determined by the advertising platform."
        action={
          <Button href="/adly/workspace" variant="outline" size="sm">
            Overview
          </Button>
        }
      />

      <AdlyStep n={1} title="Select objective">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPAIGN_OBJECTIVES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setObjective(o.id)}
              className={cn(
                "rounded-md border px-4 py-3 text-left text-small transition-colors",
                objective === o.id
                  ? "border-accent/40 bg-accent-soft text-ink"
                  : "border-border bg-bg-elevated text-ink-muted hover:border-border-strong"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </AdlyStep>

      <AdlyStep n={2} title="Select platform">
        <p className="mb-4 text-small text-ink-muted">
          Live today: Google Ads and X. Meta family and TikTok are listed for
          roadmap visibility — coming soon and not selectable.
        </p>

        <div className="space-y-4">
          <div>
            <p className="meta-label mb-2 text-accent">Active</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AD_PLATFORMS.filter((p) => p.available).map((p) => {
                const on = platforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-md border px-4 py-3 text-left transition-colors",
                      on
                        ? "border-accent/40 bg-accent-soft"
                        : "border-border bg-bg-elevated hover:border-border-strong"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-small font-medium text-ink">{p.name}</p>
                      <span className="rounded-sm border border-success/30 bg-success-muted px-1.5 py-0.5 text-meta uppercase tracking-[0.06em] text-success">
                        Live
                      </span>
                    </div>
                    <p className="mt-1 text-caption text-ink-subtle">
                      {p.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-bg-elevated/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-small font-medium text-ink">Meta</p>
                <p className="mt-0.5 text-caption text-ink-subtle">
                  Instagram, Facebook and WhatsApp are managed under Meta Ads —
                  coming soon to Adly.
                </p>
              </div>
              <span className="rounded-sm border border-border bg-surface px-2 py-1 text-meta uppercase tracking-[0.06em] text-ink-subtle">
                Coming soon
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {AD_PLATFORMS.filter((p) => p.family === "meta" && p.id !== "meta").map(
                (p) => (
                  <div
                    key={p.id}
                    aria-disabled="true"
                    className="cursor-not-allowed rounded-md border border-border bg-surface/60 px-3 py-3 opacity-60"
                  >
                    <p className="text-small font-medium text-ink-muted">
                      {p.name}
                    </p>
                    <p className="mt-1 text-caption text-ink-subtle">
                      {p.description}
                    </p>
                    <p className="mt-2 text-meta uppercase tracking-[0.06em] text-ink-subtle">
                      Coming soon
                    </p>
                  </div>
                )
              )}
            </div>
          </div>

          <div>
            <p className="meta-label mb-2 text-ink-subtle">Also coming soon</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {AD_PLATFORMS.filter(
                (p) => !p.available && p.family !== "meta"
              ).map((p) => (
                <div
                  key={p.id}
                  aria-disabled="true"
                  className="cursor-not-allowed rounded-md border border-border bg-surface/60 px-4 py-3 opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-small font-medium text-ink-muted">
                      {p.name}
                    </p>
                    <span className="text-meta uppercase tracking-[0.06em] text-ink-subtle">
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-1 text-caption text-ink-subtle">
                    {p.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {platforms.filter(isAdPlatformAvailable).length === 0 && (
          <p className="mt-3 text-caption text-warning">
            Select at least one active platform (Google Ads or X) to continue.
          </p>
        )}
      </AdlyStep>

      <AdlyStep n={3} title="Define campaign">
        <div className="grid gap-4 md:grid-cols-2">
          <AdminField label="Campaign name">
            <AdminInput value={name} onChange={(e) => setName(e.target.value)} />
          </AdminField>
          <OwnedLeaderField
            label="Candidate / leader"
            leaders={leaders}
            leaderId={leaderId}
            isAdmin={isAdmin}
            onChange={(id) => {
              setLeaderId(id);
              setProjectId("");
            }}
          />
          <AdminField label="Project (optional)">
            <AdminSelect
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— None —</option>
              {scopedProjects.length === 0 ? (
                <option value="" disabled>
                  No uploaded projects yet — add them in your dashboard
                </option>
              ) : (
                scopedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </AdminSelect>
          </AdminField>
          <AdminField label="Audience">
            <AdminInput
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </AdminField>
          <AdminField label="County">
            <AdminSelect value={county} onChange={(e) => setCounty(e.target.value)}>
              {COUNTIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Constituency">
            <AdminInput
              value={constituency}
              onChange={(e) => setConstituency(e.target.value)}
              placeholder="Optional"
            />
          </AdminField>
          <AdminField label="Ward">
            <AdminInput
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              placeholder="Optional"
            />
          </AdminField>
          <AdminField label="Budget (KES)">
            <AdminInput
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </AdminField>
          <AdminField label="Start date">
            <AdminInput
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </AdminField>
          <AdminField label="End date">
            <AdminInput
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </AdminField>
        </div>

        <div className="mt-6 space-y-4 border-t border-border pt-6">
          <p className="meta-label">Creative</p>
          <AdminField label="Headline">
            <AdminInput
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </AdminField>
          <AdminField label="Body copy">
            <AdminTextarea value={body} onChange={(e) => setBody(e.target.value)} />
          </AdminField>
          <AdminField label="CTA">
            <AdminInput value={cta} onChange={(e) => setCta(e.target.value)} />
          </AdminField>
          <ImageField
            label="Creative image"
            value={image}
            onChange={setImage}
            hint="Paste a URL or upload from this device."
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={createCampaign} disabled={busy || !name || platforms.filter(isAdPlatformAvailable).length === 0}>
            {busy ? "Running Adly review…" : "Run policy review & save draft"}
          </Button>
        </div>
        {reviewNote && (
          <p className="mt-4 rounded-md border border-border-accent bg-accent-soft p-3 text-caption text-ink-muted">
            {reviewNote}
          </p>
        )}
      </AdlyStep>

      <section className="rounded-lg border border-border bg-surface p-5 md:p-6">
        <h2 className="text-h3 text-ink">Adly Policy Review</h2>
        <p className="mt-2 text-small text-ink-muted">
          Adly checks your campaign against configured platform requirements. Final
          approval is determined by the advertising platform.
        </p>
        <ul className="mt-5 space-y-3">
          {myReviews.slice(0, 2).map((rev) => (
            <li key={rev.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-small font-medium text-ink">
                  Campaign {rev.campaignId}
                </p>
                <PolicyStatusBadge status={rev.status} />
              </div>
              <ul className="mt-3 space-y-2">
                {rev.checks.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-start justify-between gap-2 text-caption"
                  >
                    <span className="text-ink-muted">
                      <span className="text-ink">{c.label}</span> — {c.note}
                    </span>
                    <PolicyStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-h3 text-ink">Your campaigns</h2>
        <ul className="space-y-3">
          {myCampaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/adly/advertising/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-4 hover:border-border-strong"
              >
                <div>
                  <p className="text-small font-medium text-ink">{c.name}</p>
                  <p className="mt-1 text-caption text-ink-subtle">
                    {formatCurrency(c.budget, c.currency)} budget ·{" "}
                    {c.platformIds.map(getAdPlatformName).join(", ")}
                  </p>
                </div>
                <StatusBadge
                  status={c.status.replace("-", " ")}
                  tone={c.status === "active" ? "success" : "warning"}
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
