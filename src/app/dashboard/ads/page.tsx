"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, Sparkles, Users, Wallet } from "lucide-react";
import { AdminField, AdminHeader, AdminInput, AdminSelect, AdminTextarea } from "@/components/admin/AdminUI";
import { Button } from "@/components/ui/Button";
import { AdPreview } from "@/components/ads/AdPreview";
import { KeywordInput } from "@/components/ads/KeywordInput";
import { AdCampaignCard, type AdCardAction, type AdCardControls } from "@/components/ads/AdCampaignCard";
import { AdlyAdsAssistant, AdlyHelpCard } from "@/components/ads/AdlyAdsAssistant";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { apiJson } from "@/lib/api-client";
import { MIN_AD_BUDGET_KES } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";
import type { AdCampaign, AdPlatform, Project } from "@/types";

interface Quote {
  kesPerUsd: number;
  reachPerKes: number;
  minBudgetKes: number;
  maxBudgetKes: number;
  requireApproval: boolean;
  limits: { headline: number; body: number; keywords: number; keywordLength: number; minDays: number; maxDays: number };
  platforms: { platform: AdPlatform; configured: boolean }[];
  /** "tracker": the wallet is charged per network on publish. Absent on the legacy store. */
  backend?: "tracker";
  chargeOn?: "publish";
  controls?: AdCardControls;
}

const PRESETS = [100, 500, 1000, 2500, 5000, 10000, 25000];

/** Shorten to a limit without cutting a word in half. */
function clip(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit + 1);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.5 ? cut.slice(0, space) : clean.slice(0, limit)).replace(/[\s,.;:—–-]+$/, "");
}
const SLIDER_MAX = 50000;

function suggestionsFor(project: Project | undefined): string[] {
  if (!project) return [];
  return Array.from(
    new Set(
      [
        project.location.split(",")[0],
        `${project.county} County`,
        project.subcategory,
        project.category === "infrastructure" ? "infrastructure" : "community development",
        `${project.county} development`,
        project.name.split(/[—–-]/)[0],
      ]
        .map((s) => s?.trim())
        .filter((s): s is string => Boolean(s && s.length <= 80))
    )
  );
}

export default function PoliticianAdsPage() {
  const { leader } = usePoliticianProfile();
  const { getProjectsByIds } = useContent();
  const projects = useMemo(() => (leader ? getProjectsByIds(leader.projectIds) : []), [leader, getProjectsByIds]);

  const [items, setItems] = useState<AdCampaign[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<{ id: string; action: AdCardAction } | null>(null);

  const [projectId, setProjectId] = useState("");
  const [platforms, setPlatforms] = useState<AdPlatform[]>(["x", "google"]);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [budget, setBudget] = useState(1000);
  const [days, setDays] = useState(7);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Adly side panel: open state and the ad it is working on.
  const [adlyOpen, setAdlyOpen] = useState(false);
  const [adlyCampaignId, setAdlyCampaignId] = useState<string | null>(null);
  const openAdly = (id?: string | null) => {
    setAdlyCampaignId(id ?? adlyCampaignId ?? items[0]?.id ?? null);
    setAdlyOpen(true);
  };

  const load = useCallback(async () => {
    const result = await apiJson<{ items?: AdCampaign[]; quote?: Quote; walletBalance?: number; error?: string }>("/api/ads/campaigns");
    if (!result.ok) {
      setLoadError(result.data.error || "Could not load your ads.");
      return;
    }
    setLoadError("");
    setItems(result.data.items ?? []);
    if (result.data.quote) setQuote(result.data.quote);
    if (typeof result.data.walletBalance === "number") setBalance(result.data.walletBalance);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const project = projects.find((p) => p.id === projectId);

  // Pick a project: fill the copy from it (the user can edit everything).
  const chooseProject = (id: string) => {
    setProjectId(id);
    const next = projects.find((p) => p.id === id);
    if (!next) return;
    setHeadline(clip(next.name, quote?.limits.headline ?? 30));
    setBody(clip(next.description, quote?.limits.body ?? 220));
    setKeywords(suggestionsFor(next).slice(0, 3));
    setFormError("");
  };

  useEffect(() => {
    if (!projectId && projects[0] && quote) chooseProject(projects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, quote]);

  // Default to the networks that are actually set up.
  useEffect(() => {
    if (!quote) return;
    setPlatforms((current) => current.filter((p) => quote.platforms.find((q) => q.platform === p)?.configured));
  }, [quote]);

  if (!leader) return null;

  const limits = quote?.limits;
  const chargeOnPublish = quote?.chargeOn === "publish";
  const min = quote?.minBudgetKes ?? MIN_AD_BUDGET_KES;
  const reach = Math.round(budget * (quote?.reachPerKes ?? 10));
  const usd = budget / (quote?.kesPerUsd ?? 129);
  const perNetwork = platforms.length ? Math.floor(budget / platforms.length) : 0;
  const insufficient = balance !== null && budget > balance;
  const landingUrl = project ? `${typeof window === "undefined" ? "" : window.location.origin}/projects/${project.slug}` : "";

  const preview = (
    <AdPreview
      advertiser={`${leader.honorific} ${leader.name}`}
      avatar={leader.photo}
      headline={headline}
      body={body}
      imageUrl={project?.image ?? ""}
      landingUrl={landingUrl}
      platforms={platforms}
    />
  );

  const validate = (): string => {
    if (!project) return "Choose a project to promote.";
    if (!project.image) return "This project has no image. Add one on the Projects page first.";
    if (platforms.length === 0) return "Choose X, Google or both.";
    if (!headline.trim()) return "Add a headline.";
    if (!body.trim()) return "Add the ad text.";
    if (keywords.length === 0) return "Add at least one keyword.";
    if (budget < min) return `The minimum budget is ${formatCurrency(min)}.`;
    // On the Tracker backend an ad awaiting approval is charged later, at publish.
    if (insufficient && !(chargeOnPublish && quote?.requireApproval)) return "Your wallet balance is too low for this budget.";
    return "";
  };

  const submit = async () => {
    setSubmitting(true);
    setFormError("");
    const result = await apiJson<{ item?: AdCampaign; walletBalance?: number; error?: string }>("/api/ads/campaigns", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        platforms,
        headline: headline.trim(),
        body: body.trim(),
        keywords,
        budgetKes: budget,
        durationDays: days,
      }),
    });
    setSubmitting(false);
    setConfirming(false);
    if (!result.ok || !result.data.item) {
      setFormError(result.data.error || "Could not create the ad.");
      return;
    }
    const created = result.data.item;
    setItems((current) => [created, ...current]);
    setCreatedId(created.id);
    if (typeof result.data.walletBalance === "number") setBalance(result.data.walletBalance);
    setNotice(
      created.status === "pending_approval"
        ? chargeOnPublish
          ? "Your ad is waiting for approval. Nothing is charged yet: once an admin approves it, publish it and your wallet pays each network that accepts it."
          : `${formatCurrency(budget)} paid from your wallet. Your ad is waiting for approval — it goes live as soon as an admin approves it.`
        : created.statusNote || "Your ad was submitted."
    );
    document.getElementById("your-ads")?.scrollIntoView({ behavior: "smooth" });
  };

  const act = async (campaign: AdCampaign, action: AdCardAction) => {
    if (action === "stop" && !confirm("Stop this ad now? Unspent budget goes back to your wallet.")) return;
    if (
      action === "reject" &&
      !confirm(chargeOnPublish ? "Cancel this ad? Nothing has been charged." : "Cancel this ad? The full budget goes back to your wallet.")
    )
      return;
    if (action === "publish" && !confirm(`Publish "${campaign.name}" now? Your wallet pays each network that accepts the ad.`)) return;
    setBusy({ id: campaign.id, action });
    const result = await apiJson<{ item?: AdCampaign; walletBalance?: number; warnings?: string[]; error?: string }>(
      `/api/ads/campaigns/${encodeURIComponent(campaign.id)}`,
      { method: "POST", body: JSON.stringify({ action }) }
    );
    setBusy(null);
    if (!result.ok || !result.data.item) {
      alert(result.data.error || "Could not update the ad.");
      return;
    }
    const updated = result.data.item;
    setItems((current) => current.map((c) => (c.id === updated.id ? updated : c)));
    if (typeof result.data.walletBalance === "number") setBalance(result.data.walletBalance);
    // A network accepted the ad but the wallet charge failed: say so plainly.
    if (result.data.warnings?.length) alert(result.data.warnings.join("\n"));
  };

  return (
    <div>
      <AdminHeader
        title="Ads"
        description="Promote your projects on X and Google. Pay from your wallet, pick keywords, and preview the ad before it runs."
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => openAdly()}>
              <Sparkles className="h-4 w-4" />
              Ask Adly
            </Button>
            <Button href="/dashboard/wallet" variant="outline">
              <Wallet className="h-4 w-4" />
              {balance === null ? "Wallet" : `Wallet · ${formatCurrency(balance)}`}
            </Button>
          </div>
        }
      />

      {loadError && (
        <p className="mb-6 rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">{loadError}</p>
      )}

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="text-small text-ink-muted">Add a project with a photo first — ads promote your projects.</p>
          <Button href="/dashboard/projects" size="sm" className="mt-4">
            Go to projects
          </Button>
        </div>
      ) : (
        <section className="grid gap-8 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="space-y-6">
            <Step n={1} title="What to promote">
              <AdminField label="Project">
                <AdminSelect value={projectId} onChange={(e) => chooseProject(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              {project && !project.image && (
                <p className="text-caption text-error">
                  This project has no image yet. <Link href="/dashboard/projects" className="underline">Add one</Link> to use it in an ad.
                </p>
              )}
              <div>
                <p className="meta-label mb-2">Where to run it</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["x", "google"] as const).map((p) => {
                    const configured = quote?.platforms.find((q) => q.platform === p)?.configured ?? false;
                    const on = platforms.includes(p);
                    return (
                      <label
                        key={p}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                          on ? "border-accent/40 bg-accent-soft" : "border-border bg-surface",
                          !configured && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[rgb(var(--color-accent))]"
                          checked={on}
                          disabled={!configured}
                          onChange={(e) =>
                            setPlatforms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))
                          }
                        />
                        <span>
                          <span className="block text-small font-medium text-ink">{p === "x" ? "X (Twitter)" : "Google"}</span>
                          <span className="block text-caption text-ink-muted">
                            {!configured
                              ? "Not set up on this server"
                              : p === "x"
                                ? "Promoted post in timelines across Kenya"
                                : "Image ads on websites, apps and YouTube across Kenya"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </Step>

            <Step n={2} title="The ad">
              <AdminField label={`Headline (${headline.length}/${limits?.headline ?? 30})`}>
                <AdminInput value={headline} maxLength={limits?.headline ?? 30} onChange={(e) => setHeadline(e.target.value)} />
              </AdminField>
              <AdminField label={`Ad text (${body.length}/${limits?.body ?? 220})`} hint="Google shows the first 90 characters; X shows it all.">
                <AdminTextarea value={body} maxLength={limits?.body ?? 220} onChange={(e) => setBody(e.target.value)} />
              </AdminField>
              <p className="text-caption text-ink-subtle">
                The ad uses the project&apos;s photo and links to its public project page.
              </p>
              {/* Phones: show the preview here, before the budget and the pay button. */}
              <div className="border-t border-border pt-4 lg:hidden">
                <p className="meta-label mb-3">Preview</p>
                {preview}
              </div>
            </Step>

            <Step n={3} title="Keywords">
              <KeywordInput
                value={keywords}
                onChange={setKeywords}
                suggestions={suggestionsFor(project)}
                max={limits?.keywords ?? 20}
                maxLength={limits?.keywordLength ?? 80}
              />
            </Step>

            <Step n={4} title="Budget">
              <div className="rounded-lg border border-border bg-bg-elevated p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="meta-label">Total budget</p>
                    <p className="mt-1 font-mono text-h2 text-ink">{formatCurrency(budget)}</p>
                  </div>
                  <div className="text-right">
                    <p className="meta-label">Estimated reach</p>
                    <p className="mt-1 flex items-center justify-end gap-1.5 font-mono text-h3 text-accent">
                      <Users className="h-4 w-4" aria-hidden />~{reach.toLocaleString()} people
                    </p>
                  </div>
                </div>
                <input
                  type="range"
                  min={min}
                  max={Math.max(SLIDER_MAX, budget)}
                  step={100}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="mt-4 w-full accent-[rgb(var(--color-accent))]"
                  aria-label="Budget in KES"
                />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBudget(value)}
                      className={cn(
                        "min-h-[36px] rounded-full border px-3 text-caption transition-colors",
                        budget === value ? "border-accent bg-accent text-ink-inverse" : "border-border text-ink-muted hover:text-ink"
                      )}
                    >
                      {formatCurrency(value)}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <AdminField label="Exact amount (KES)">
                    <AdminInput
                      type="number"
                      min={min}
                      max={quote?.maxBudgetKes}
                      step={100}
                      value={budget}
                      onChange={(e) => setBudget(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                    />
                  </AdminField>
                  <AdminField label="Run for">
                    <AdminSelect value={days} onChange={(e) => setDays(Number(e.target.value))}>
                      {[1, 3, 5, 7, 10, 14, 21, 30].map((d) => (
                        <option key={d} value={d}>
                          {d} day{d === 1 ? "" : "s"}
                        </option>
                      ))}
                    </AdminSelect>
                  </AdminField>
                </div>
                <ul className="mt-4 space-y-1 text-caption text-ink-muted">
                  <li>
                    About {formatCurrency(Math.round(budget / days))} per day for {days} day{days === 1 ? "" : "s"}.
                  </li>
                  {platforms.length > 1 && <li>Split evenly: {formatCurrency(perNetwork)} on X and {formatCurrency(budget - perNetwork)} on Google.</li>}
                  <li>
                    Paid to the networks as ≈ US${usd.toFixed(2)} (KES {quote?.kesPerUsd ?? 129} = $1).{" "}
                    {chargeOnPublish
                      ? "Your wallet is charged per network when that network accepts the ad."
                      : "Unspent money is refunded to your wallet."}
                  </li>
                  <li>Reach is an estimate (~{quote?.reachPerKes ?? 10} people per KES); actual results depend on the audience and the networks.</li>
                </ul>
              </div>
              {insufficient && (
                <p className="rounded-md border border-warning/30 bg-warning-muted px-3 py-2 text-caption text-warning">
                  Your wallet has {formatCurrency(balance ?? 0)}.{" "}
                  <Link href="/dashboard/wallet" className="underline">Top up</Link> or lower the budget.
                </p>
              )}
            </Step>

            {formError && (
              <p className="rounded-md border border-error/30 bg-error-muted px-3 py-2 text-small text-error">{formError}</p>
            )}
            <Button
              type="button"
              size="lg"
              fullWidth
              disabled={submitting || !quote}
              onClick={() => {
                const problem = validate();
                if (problem) {
                  setFormError(problem);
                  return;
                }
                setFormError("");
                setConfirming(true);
              }}
            >
              <Megaphone className="h-4 w-4" />
              {chargeOnPublish
                ? quote?.requireApproval
                  ? "Submit for approval"
                  : `Pay ${formatCurrency(budget)} & launch ad`
                : `Pay ${formatCurrency(budget)} & ${quote?.requireApproval ? "submit for approval" : "launch ad"}`}
            </Button>

            <AdlyHelpCard hasAds={items.length > 0} onAsk={() => openAdly()} />
          </div>

          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <p className="meta-label mb-3">Preview</p>
            {preview}
          </aside>
        </section>
      )}

      <section id="your-ads" className="mt-12 scroll-mt-24">
        <h2 className="text-h3 text-ink">Your ads</h2>
        {notice && (
          <div className="mt-3 rounded-md border border-success/30 bg-success-muted px-3 py-2 text-small text-success" role="status">
            <p>{notice}</p>
            {createdId && (
              <button
                type="button"
                onClick={() => openAdly(createdId)}
                className="mt-1 inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Ask Adly to review this ad
              </button>
            )}
          </div>
        )}
        {items.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-small text-ink-muted">
            No ads yet. Your campaigns and their results will appear here.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {items.map((campaign) => (
              <div key={campaign.id}>
                <AdCampaignCard
                  campaign={campaign}
                  busy={busy?.id === campaign.id ? busy.action : null}
                  controls={quote?.controls}
                  approvalPublishes={!chargeOnPublish}
                  onAction={(action) => void act(campaign, action)}
                />
                <button
                  type="button"
                  onClick={() => openAdly(campaign.id)}
                  className="mt-1.5 inline-flex min-h-[36px] items-center gap-1.5 px-1 text-caption font-medium text-accent hover:text-accent-hover"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Ask Adly about this ad
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdlyAdsAssistant
        open={adlyOpen}
        campaigns={items}
        campaignId={adlyCampaignId}
        onSelect={setAdlyCampaignId}
        onClose={() => setAdlyOpen(false)}
        onChanged={() => void load()}
      />

      {confirming && project && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
          <button type="button" className="absolute inset-0 bg-bg/75 backdrop-blur-sm" aria-label="Close" onClick={() => setConfirming(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md rounded-t-lg border border-border bg-bg-elevated p-5 shadow-raised sm:rounded-lg">
            <h2 className="text-h3 text-ink">{chargeOnPublish && quote?.requireApproval ? "Confirm ad" : "Confirm ad payment"}</h2>
            <dl className="mt-4 space-y-2 text-small">
              <Row label="Project" value={project.name} />
              <Row label="Networks" value={platforms.map((p) => (p === "x" ? "X" : "Google")).join(" + ")} />
              <Row label="Duration" value={`${days} day${days === 1 ? "" : "s"}`} />
              <Row label="Keywords" value={`${keywords.length}`} />
              <Row label="Estimated reach" value={`~${reach.toLocaleString()} people`} />
              <Row
                label={chargeOnPublish && quote?.requireApproval ? "Budget (charged on publish)" : "Paid from wallet"}
                value={formatCurrency(budget)}
                strong
              />
            </dl>
            <p className="mt-4 text-caption text-ink-muted">
              {chargeOnPublish
                ? quote?.requireApproval
                  ? "Nothing is charged now. After an admin approves the ad you publish it, and your wallet pays each network that accepts it."
                  : "The ad is published right away. Your wallet pays each network that accepts it; a network that rejects it costs nothing."
                : quote?.requireApproval
                  ? "The money is held for this ad now. If the ad is not approved, or a network rejects it, it is refunded to your wallet."
                  : "The ad is published right away. If a network rejects it, that share is refunded to your wallet."}
            </p>
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="secondary" fullWidth onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button type="button" fullWidth disabled={submitting} onClick={() => void submit()}>
                {submitting ? "Submitting…" : chargeOnPublish && quote?.requireApproval ? "Submit" : `Pay ${formatCurrency(budget)}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-small font-medium text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-ink-inverse">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn("text-right", strong ? "font-mono font-bold text-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}
