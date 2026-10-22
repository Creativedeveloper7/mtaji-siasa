/**
 * Tracker adly_campaigns rows  <->  Siasa types.
 *
 * Two Siasa views read the same table:
 *  - `Campaign` / `AdCreative` / `AdlyInsight`   (the Adly workspace, src/types/adly.ts)
 *  - `AdCampaign`                                 (paid ads on the dashboard, src/types/index.ts)
 *
 * Rules:
 *  - Columns and targeting / creative jsonb are written in the Tracker's own
 *    shape so the Tracker UI keeps reading them.
 *  - Siasa-only fields live under `metadata.siasa` (see SiasaMeta). The
 *    Tracker ignores that key.
 *  - Updates merge into the stored jsonb. Keys Siasa does not know (wizard,
 *    chat_docs, media, provider ids, ...) are never dropped.
 *
 * Everything here is pure, so it is unit tested without Supabase.
 */
import type { AdCampaign, AdCampaignStatus, AdPlatform, AdPlatformRun } from "@/types";
import type {
  AdCreative,
  AdlyInsight,
  AdPerformance,
  AdPlatformId,
  Campaign,
  CampaignObjective,
  CampaignStatus,
  GeoTargeting,
  PolicyReview,
} from "@/types/adly";
import type {
  AdPublishAuditRow,
  AdChannelStatRow,
  AdlyCampaignRow,
  AdRecommendationRow,
  TrackerCampaignStatus,
  TrackerChannel,
} from "@/server/tracker/adly/rows";
import {
  ALL_ADULTS_AGE_GROUP,
  PROVIDER_CAMPAIGN_KEY,
  clampDuration,
  formatLocationLabel,
  normalizeChannel,
  normalizePlan,
  num,
  obj,
  parseCampaignScope,
  parseCreative,
  parseLocationLabel,
  parseLocationSelections,
  resolvePublishChannels,
  splitBudgetAcrossChannels,
  str,
  strArr,
  withCampaignScope,
  type AdlyCreativeJson,
  type AdlyLocationSelection,
  TRACKER_KES_PER_USD,
} from "@/server/tracker/adly/plan";

// ---------------------------------------------------------------------------
// metadata.siasa

export type ReviewState = "pending" | "approved" | "rejected" | "cancelled";

export interface SiasaReview {
  state: ReviewState;
  note?: string;
  /** ISO time of the last change */
  at: string;
  /** auth user id of whoever made the last change */
  by?: string;
}

export interface SiasaMeta {
  /** political_figures.id the ad is for */
  leader_id?: string;
  /** Exact Siasa objective when the Tracker column holds a coarser one */
  objective?: CampaignObjective;
  start_date?: string;
  end_date?: string;
  /** Public image URL shown in Siasa (the bucket copy is in creative.media) */
  image_url?: string;
  estimated_reach?: number;
  /** "ads" = dashboard paid-ads composer, "adly" = Adly workspace */
  source?: "ads" | "adly";
  /** Siasa admin approval gate (ADS_REQUIRE_APPROVAL) */
  review?: SiasaReview;
  /** Adly policy pre-check for this campaign */
  policy_review?: PolicyReview;
}

export function readSiasaMeta(metadata: unknown): SiasaMeta {
  const s = obj(obj(metadata).siasa);
  const review = obj(s.review);
  const state = review.state;
  const policy = obj(s.policy_review);
  return clean<SiasaMeta>({
    leader_id: str(s.leader_id),
    objective: OBJECTIVES.includes(s.objective as CampaignObjective) ? (s.objective as CampaignObjective) : undefined,
    start_date: str(s.start_date),
    end_date: str(s.end_date),
    image_url: str(s.image_url),
    estimated_reach: typeof s.estimated_reach === "number" ? s.estimated_reach : undefined,
    source: s.source === "ads" || s.source === "adly" ? s.source : undefined,
    review:
      state === "pending" || state === "approved" || state === "rejected" || state === "cancelled"
        ? clean<SiasaReview>({ state, note: str(review.note), at: str(review.at) ?? "", by: str(review.by) })
        : undefined,
    policy_review: str(policy.id) && Array.isArray(policy.checks) ? (policy as unknown as PolicyReview) : undefined,
  });
}

/** Merge a patch into metadata.siasa, keeping every other metadata key. */
export function withSiasaMeta(metadata: unknown, patch: Partial<SiasaMeta>): Record<string, unknown> {
  const base = { ...obj(metadata) };
  const current = obj(base.siasa);
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  base.siasa = next;
  return base;
}

function clean<T extends object>(o: T): T {
  const rec = o as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (rec[key] === undefined) delete rec[key];
  return o;
}

// ---------------------------------------------------------------------------
// objective

const OBJECTIVES: readonly CampaignObjective[] = [
  "awareness",
  "reach",
  "engagement",
  "traffic",
  "leads",
  "community-support",
  "project-visibility",
];

/** Tracker objective column. The Tracker writes "awareness"; keep to plain words it understands. */
export function toTrackerObjective(objective: CampaignObjective): string {
  if (objective === "engagement" || objective === "traffic" || objective === "leads") return objective;
  return "awareness";
}

export function fromTrackerObjective(row: Pick<AdlyCampaignRow, "objective" | "metadata">): CampaignObjective {
  const exact = readSiasaMeta(row.metadata).objective;
  if (exact) return exact;
  const o = (row.objective ?? "").toLowerCase();
  return OBJECTIVES.includes(o as CampaignObjective) ? (o as CampaignObjective) : "awareness";
}

// ---------------------------------------------------------------------------
// channels <-> Siasa platform ids

/** Siasa Adly platform ids -> Tracker channels. Instagram/Facebook/WhatsApp run on Meta Ads. */
export function platformIdsToChannels(ids: readonly AdPlatformId[]): TrackerChannel[] {
  const out: TrackerChannel[] = [];
  for (const id of ids) {
    const ch: TrackerChannel =
      id === "instagram" || id === "facebook" || id === "whatsapp" || id === "meta" ? "meta" : id;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/** Tracker channels -> Siasa platform ids. YouTube has no Siasa id and is left out (kept in the row). */
export function channelsToPlatformIds(channels: readonly string[] | null | undefined): AdPlatformId[] {
  const out: AdPlatformId[] = [];
  for (const raw of channels ?? []) {
    const ch = normalizeChannel(raw);
    if (!ch || ch === "youtube") continue;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

/** Keep channels Siasa cannot express (youtube) when Siasa rewrites the list. */
export function mergeChannels(existing: readonly string[] | null | undefined, next: readonly TrackerChannel[]): string[] {
  const keep = (existing ?? []).filter((c) => normalizeChannel(c) === "youtube");
  return Array.from(new Set([...next, ...keep]));
}

// ---------------------------------------------------------------------------
// targeting

export function rowToGeoTargeting(row: Pick<AdlyCampaignRow, "targeting" | "metadata">): GeoTargeting {
  const selections = parseLocationSelections(row.metadata);
  const first = selections.find((s) => s.county) ?? selections[0];
  if (first) {
    return clean({ country: "Kenya", county: first.county, constituency: first.constituency, ward: first.ward });
  }
  const label = strArr(obj(row.targeting).locations)?.[0];
  const parts = label ? parseLocationLabel(label) : {};
  return clean({ country: "Kenya", ...parts });
}

/** Write a Siasa GeoTargeting into targeting.locations + metadata.location_selections. */
export function geoToTracker(geo: GeoTargeting): { locations: string[]; selections: AdlyLocationSelection[] } {
  if (!geo.county) return { locations: ["Kenya"], selections: [] };
  const parts = { county: geo.county, constituency: geo.constituency || undefined, ward: geo.ward || undefined };
  const label = formatLocationLabel(parts);
  return { locations: [label], selections: [clean({ ...parts, label, source: "hierarchy" as const })] };
}

// ---------------------------------------------------------------------------
// status

export function toTrackerStatus(status: CampaignStatus): TrackerCampaignStatus {
  if (status === "active") return "live";
  if (status === "paused") return "paused";
  if (status === "completed") return "completed";
  return "draft"; // draft, in-review (the review lives in metadata.siasa.review)
}

export function fromTrackerStatus(row: Pick<AdlyCampaignRow, "status" | "metadata">): CampaignStatus {
  const review = readSiasaMeta(row.metadata).review;
  switch (row.status) {
    case "live":
    case "submitted":
      return "active";
    case "paused":
      return "paused";
    case "completed":
    case "archived":
      return "completed";
    default:
      return review?.state === "pending" ? "in-review" : "draft";
  }
}

// ---------------------------------------------------------------------------
// performance (ad_channel_stats)

export function statsToPerformance(stats: readonly AdChannelStatRow[]): AdPerformance {
  const impressions = stats.reduce((s, r) => s + num(r.impressions), 0);
  const clicks = stats.reduce((s, r) => s + num(r.clicks), 0);
  const spend = stats.reduce((s, r) => s + num(r.spend_kes), 0);
  return {
    spend: Math.round(spend * 100) / 100,
    // The Tracker has no reach metric (only impressions/clicks/spend).
    reach: 0,
    impressions,
    engagement: clicks,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    conversions: 0,
    currency: "KES",
  };
}

// ---------------------------------------------------------------------------
// Adly workspace: row -> Campaign / AdCreative

export const creativeIdFor = (campaignId: string) => `cr_${campaignId}`;
export const campaignIdFromCreativeId = (creativeId: string) =>
  creativeId.startsWith("cr_") ? creativeId.slice(3) : null;

function hasCreativeCopy(c: AdlyCreativeJson): boolean {
  return Boolean(c.headline || c.body || c.hook || c.cta);
}

function slugFrom(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base ? `${base}-${id.slice(0, 8)}` : id;
}

function addDays(iso: string, days: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export interface RowContext {
  stats?: readonly AdChannelStatRow[];
  /** Leader shown when metadata.siasa.leader_id is missing (rows made in the Tracker) */
  fallbackLeaderId?: string;
}

export function rowToCampaign(row: AdlyCampaignRow, ctx: RowContext = {}): Campaign {
  const siasa = readSiasaMeta(row.metadata);
  const plan = normalizePlan(row);
  const scope = parseCampaignScope(row.metadata);
  const creative = parseCreative(row.creative);
  const meta = obj(row.metadata);
  const start = siasa.start_date ?? (str(meta.last_publish_at) ?? row.created_at).slice(0, 10);
  return clean({
    id: row.id,
    slug: slugFrom(row.name, row.id),
    name: row.name,
    objective: fromTrackerObjective(row),
    status: fromTrackerStatus(row),
    platformIds: channelsToPlatformIds(row.channels),
    leaderId: siasa.leader_id ?? ctx.fallbackLeaderId ?? "",
    projectId: scope.project_id ?? undefined,
    targeting: rowToGeoTargeting(row),
    startDate: start,
    endDate: siasa.end_date ?? addDays(start, plan.durationDays - 1),
    budget: plan.budgetKes,
    currency: "KES",
    creativeIds: hasCreativeCopy(creative) ? [creativeIdFor(row.id)] : [],
    performance: statsToPerformance(ctx.stats ?? []),
    policyReviewId: siasa.policy_review?.id,
    createdAt: row.created_at,
  });
}

/** `imageUrl` is a public or signed URL for the creative's thumbnail, resolved by the caller. */
export function rowToCreative(row: AdlyCampaignRow, ctx: RowContext & { imageUrl?: string } = {}): AdCreative | null {
  const creative = parseCreative(row.creative);
  if (!hasCreativeCopy(creative)) return null;
  const siasa = readSiasaMeta(row.metadata);
  return clean({
    id: creativeIdFor(row.id),
    name: `${row.name} creative`,
    headline: creative.headline ?? creative.hook ?? row.name,
    body: creative.body ?? "",
    cta: creative.cta ?? "Learn more",
    image: siasa.image_url ?? ctx.imageUrl ?? "",
    platformIds: channelsToPlatformIds(row.channels),
    performance: ctx.stats?.length ? statsToPerformance(ctx.stats) : undefined,
  });
}

/** Pending Adly agent recommendations, shown as workspace insights. */
export function recommendationToInsight(reco: AdRecommendationRow, campaignId: string): AdlyInsight {
  const kind = str(obj(reco.metadata).kind) ?? "recommendation";
  return {
    id: reco.id,
    tone: kind === "optimize" ? "attention" : "neutral",
    title: reco.headline?.trim() || `${channelLabel(reco.channel)} ${kind.replace(/_/g, " ")}`,
    body: reco.body?.trim() || "",
    relatedCampaignId: campaignId,
  };
}

/** Sync failures recorded by sync-ad-insights, shown as attention insights. */
export function insightErrorsToInsights(row: AdlyCampaignRow): AdlyInsight[] {
  const errors = obj(row.metadata).last_insights_errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((e, i) => {
      const o = obj(e);
      const provider = str(o.provider);
      const error = str(o.error);
      if (!provider || !error) return null;
      return {
        id: `${row.id}:sync:${i}`,
        tone: "attention" as const,
        title: `${channelLabel(provider)} results could not be refreshed`,
        body: error,
        relatedCampaignId: row.id,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function channelLabel(ch: string): string {
  if (ch === "x" || ch === "twitter") return "X";
  if (ch === "youtube") return "YouTube";
  return ch ? ch.charAt(0).toUpperCase() + ch.slice(1) : ch;
}

// ---------------------------------------------------------------------------
// Adly workspace: Campaign / AdCreative -> row

export type RowWrite = Partial<
  Pick<AdlyCampaignRow, "name" | "objective" | "status" | "budget" | "budget_daily" | "channels" | "targeting" | "creative" | "metadata">
>;

function daysBetween(start: string, end: string): number | undefined {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return undefined;
  return Math.round((b - a) / 86_400_000) + 1;
}

function sameArea(a: GeoTargeting, b: GeoTargeting): boolean {
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  return norm(a.county) === norm(b.county) && norm(a.constituency) === norm(b.constituency) && norm(a.ward) === norm(b.ward);
}

/**
 * Columns for a Siasa Campaign. `existing` is the stored row on update; its
 * jsonb is merged, never replaced. `status` is left out on update when the
 * Tracker has already moved past draft (publish functions own live states).
 */
export function campaignToRow(campaign: Campaign, existing?: AdlyCampaignRow | null): RowWrite {
  const targetingBase = obj(existing?.targeting);
  const metaBase = obj(existing?.metadata);
  // Siasa holds one area; a Tracker plan can hold several. Rewrite them only when the area changed.
  const geoChanged = !existing || !sameArea(campaign.targeting, rowToGeoTargeting(existing));
  const geo = geoChanged
    ? geoToTracker(campaign.targeting)
    : {
        locations: strArr(targetingBase.locations) ?? ["Kenya"],
        selections: parseLocationSelections(existing?.metadata),
      };
  const duration = clampDuration(daysBetween(campaign.startDate, campaign.endDate)) ?? clampDuration(targetingBase.duration_days) ?? 14;
  const budget = Math.max(0, Math.round(campaign.budget));

  let metadata: Record<string, unknown> = { ...metaBase };
  if (geo.selections.length) metadata.location_selections = geo.selections;
  else delete metadata.location_selections;
  metadata = withCampaignScope(metadata, {
    campaign_type: campaign.projectId ? "project" : "manifesto",
    project_id: campaign.projectId ?? null,
    project_title: campaign.projectId ? str(metaBase.project_title) ?? null : null,
  });
  const reviewing = campaign.status === "in-review";
  const currentReview = readSiasaMeta(metaBase).review;
  metadata = withSiasaMeta(metadata, {
    leader_id: campaign.leaderId || undefined,
    objective: campaign.objective,
    start_date: campaign.startDate || undefined,
    end_date: campaign.endDate || undefined,
    source: readSiasaMeta(metaBase).source ?? "adly",
    review:
      reviewing && currentReview?.state !== "approved"
        ? { state: "pending", at: new Date().toISOString() }
        : currentReview,
  });

  const write: RowWrite = {
    name: campaign.name.trim() || "New campaign",
    objective: toTrackerObjective(campaign.objective),
    budget,
    budget_daily: Math.round(budget / duration),
    channels: mergeChannels(existing?.channels, platformIdsToChannels(campaign.platformIds)),
    targeting: {
      ...targetingBase,
      locations: geo.locations,
      age_group: str(targetingBase.age_group) ?? ALL_ADULTS_AGE_GROUP,
      interests: strArr(targetingBase.interests) ?? ["civic engagement"],
      duration_days: duration,
    },
    metadata,
  };
  if (!existing) {
    write.creative = {};
    write.status = toTrackerStatus(campaign.status);
  } else if (existing.status === "draft" || existing.status === "paused") {
    const next = toTrackerStatus(campaign.status);
    // Siasa cannot make a campaign live by editing it: that is what publishing does.
    if (next === "draft" || next === "paused") write.status = next;
  }
  return write;
}

/** Merge a Siasa AdCreative into the stored creative jsonb (media, platforms and brief kept). */
export function creativeToRow(creative: AdCreative, existing: AdlyCampaignRow): RowWrite {
  const base = obj(existing.creative);
  const platforms = obj(base.platforms);
  const google = obj(platforms.google);
  const x = obj(platforms.x);
  const metadata = withSiasaMeta(existing.metadata, { image_url: str(creative.image) });
  return {
    creative: {
      ...base,
      headline: creative.headline,
      body: creative.body,
      cta: creative.cta,
      platforms: {
        ...platforms,
        google: {
          ...google,
          headlines: [creative.headline.slice(0, 30), ...(strArr(google.headlines) ?? []).filter((h) => h !== creative.headline.slice(0, 30))].slice(0, 15),
          descriptions: strArr(google.descriptions) ?? (creative.body ? [creative.body.slice(0, 90)] : []),
        },
        x: { ...x, post: creative.body || str(x.post) || creative.headline },
      },
    },
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Paid ads (dashboard composer): AdCampaign

/** Statuses the dashboard card understands. */
export function toAdCampaignStatus(row: Pick<AdlyCampaignRow, "status" | "metadata">): AdCampaignStatus {
  const review = readSiasaMeta(row.metadata).review;
  switch (row.status) {
    case "live":
    case "submitted":
      return "active";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "archived":
      return review?.state === "rejected" || review?.state === "cancelled" ? "rejected" : "stopped";
    default:
      if (review?.state === "rejected" || review?.state === "cancelled") return "rejected";
      // Approved, or no approval needed: the owner publishes next.
      if (review?.state === "approved") return "launching";
      return "pending_approval";
  }
}

const LIVE_APPROVAL = ["active", "enabled", "serving", "learning", "live", "eligible"];
const FAILED_APPROVAL = ["failed", "rejected", "disapproved", "removed", "error", "sync_error"];

export function statToRunStatus(stat: AdChannelStatRow | undefined, campaignStatus: string): AdPlatformRun["status"] {
  if (campaignStatus === "completed" || campaignStatus === "archived") return stat ? "ended" : "pending";
  if (!stat) return campaignStatus === "live" || campaignStatus === "submitted" ? "live" : "pending";
  const s = stat.approval_status.toLowerCase();
  if (LIVE_APPROVAL.includes(s)) return "live";
  if (s === "paused") return "paused";
  if (FAILED_APPROVAL.includes(s) || s.includes("error")) return "failed";
  return "pending";
}

function externalIdsFor(channel: TrackerChannel, metadata: Record<string, unknown>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith(`${channel}_`) && key !== `${channel}_stub` && (typeof value === "string" || typeof value === "number")) {
      out[key] = String(value);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export interface AdCampaignContext extends RowContext {
  imageUrl?: string;
  /** Latest ad_publish_audit row per provider */
  audits?: readonly AdPublishAuditRow[];
  /** People per KES used for the estimate when the row has none */
  reachPerKes?: number;
}

export function rowToAdCampaign(row: AdlyCampaignRow, ctx: AdCampaignContext = {}): AdCampaign {
  const siasa = readSiasaMeta(row.metadata);
  const plan = normalizePlan(row);
  const creative = parseCreative(row.creative);
  const meta = obj(row.metadata);
  const scope = parseCampaignScope(row.metadata);
  const channels = resolvePublishChannels(row.channels);
  const shares = splitBudgetAcrossChannels(plan.budgetKes, channels);
  const stats = ctx.stats ?? [];

  const platforms: AdPlatformRun[] = channels
    .filter((c): c is AdPlatform & TrackerChannel => c === "x" || c === "google")
    .map((channel) => {
      const stat = stats.find((s) => s.provider === channel);
      const audit = ctx.audits?.find((a) => a.provider === channel);
      let status = statToRunStatus(stat, row.status);
      const auditMessage = str(obj(audit?.response_payload).error) ?? str(audit?.error) ?? str(obj(audit?.response_payload).message);
      // The last publish attempt failed and the network shows nothing live.
      if (audit?.status === "failed" && status !== "live" && status !== "paused") status = "failed";
      const syncError = obj(meta).last_insights_errors;
      const err = Array.isArray(syncError)
        ? syncError.map(obj).find((e) => e.provider === channel)
        : undefined;
      return clean({
        platform: channel,
        budgetKes: shares[channel] ?? 0,
        status,
        externalIds: externalIdsFor(channel, meta),
        error:
          status === "failed"
            ? auditMessage ?? stat?.approval_status
            : audit?.status === "dry_run" && status === "pending"
              ? `Not live (dry run): ${auditMessage ?? "network not configured"}`
              : str(err?.error),
        impressions: stat ? num(stat.impressions) : undefined,
        clicks: stat ? num(stat.clicks) : undefined,
        spentKes: stat ? num(stat.spend_kes) : undefined,
        syncedAt: stat?.synced_at ?? undefined,
      });
    });

  const startDate = str(meta.last_publish_at) ?? siasa.start_date;
  const status = toAdCampaignStatus(row);
  return clean({
    id: row.id,
    leaderId: siasa.leader_id ?? ctx.fallbackLeaderId ?? "",
    createdBy: row.user_id,
    projectId: scope.project_id ?? "",
    name: row.name,
    headline: creative.headline ?? row.name,
    body: creative.body ?? "",
    imageUrl: siasa.image_url ?? ctx.imageUrl ?? "",
    landingUrl: creative.landing_page_url ?? "",
    keywords: plan.interests,
    platforms,
    budgetKes: plan.budgetKes,
    durationDays: plan.durationDays,
    estimatedReach: siasa.estimated_reach ?? Math.round(plan.budgetKes * (ctx.reachPerKes ?? 10)),
    kesPerUsd: TRACKER_KES_PER_USD,
    status,
    statusNote: adStatusNote(status, siasa),
    startDate,
    endDate: startDate ? new Date(Date.parse(startDate) + plan.durationDays * 86_400_000).toISOString() : undefined,
    // The Tracker never refunds: it debits only after a network accepts the ad.
    refundedKes: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  });
}

function adStatusNote(status: AdCampaignStatus, siasa: SiasaMeta): string | undefined {
  const note = siasa.review?.note;
  if (status === "pending_approval") return "Waiting for an admin to approve. Nothing is charged until you publish.";
  if (status === "launching") return "Approved. Publish to send it to the networks — your wallet is charged per network that accepts it.";
  if (status === "rejected") {
    return siasa.review?.state === "cancelled" ? "Cancelled before publishing. Nothing was charged." : `Not approved${note ? `: ${note.replace(/[.\s]+$/, "")}.` : "."} Nothing was charged.`;
  }
  return undefined;
}

export interface AdComposerInput {
  name: string;
  headline: string;
  body: string;
  keywords: string[];
  platforms: AdPlatform[];
  budgetKes: number;
  durationDays: number;
  landingUrl: string;
  imageUrl: string;
  projectId: string;
  projectTitle: string;
  leaderId: string;
  estimatedReach: number;
  requireApproval: boolean;
}

/** Insert body for a dashboard paid ad (owner = the signed-in user; RLS sets nothing else). */
export function adComposerToRow(input: AdComposerInput, userId: string, now = new Date()): RowWrite & { user_id: string } {
  const days = clampDuration(input.durationDays) ?? 7;
  const budget = Math.max(0, Math.round(input.budgetKes));
  let metadata: Record<string, unknown> = withCampaignScope(
    {},
    { campaign_type: "project", project_id: input.projectId, project_title: input.projectTitle }
  );
  metadata = withSiasaMeta(metadata, {
    leader_id: input.leaderId,
    image_url: input.imageUrl || undefined,
    estimated_reach: input.estimatedReach,
    source: "ads",
    review: input.requireApproval
      ? { state: "pending", at: now.toISOString() }
      : { state: "approved", note: "No approval needed", at: now.toISOString(), by: "auto" },
  });
  return {
    user_id: userId,
    name: input.name,
    objective: "traffic",
    status: "draft",
    budget,
    budget_daily: Math.round(budget / days),
    channels: input.platforms,
    targeting: {
      locations: ["Kenya"],
      age_group: ALL_ADULTS_AGE_GROUP,
      interests: input.keywords,
      duration_days: days,
    },
    creative: {
      headline: input.headline,
      body: input.body,
      cta: "Learn more",
      landing_page_url: input.landingUrl,
      platforms: {
        google: { headlines: [input.headline.slice(0, 30)], descriptions: [input.body.slice(0, 90)] },
        x: { post: input.body },
      },
    },
    metadata,
  };
}

/**
 * Rows the paid-ads screens list: Siasa composer ads, anything sent for Siasa
 * review, and anything that has reached a network. Tracker wizard drafts stay
 * in the Adly workspace.
 */
export function isPaidAdsRow(row: Pick<AdlyCampaignRow, "status" | "metadata">): boolean {
  const siasa = readSiasaMeta(row.metadata);
  if (siasa.source === "ads" || siasa.review) return true;
  return row.status !== "draft" && row.status !== "archived";
}

/** True when a channel was already published (a new publish updates it in place). */
export function isPublishedTo(row: Pick<AdlyCampaignRow, "metadata">, channel: TrackerChannel): boolean {
  return Boolean(obj(row.metadata)[PROVIDER_CAMPAIGN_KEY[channel]]);
}
