import type {
  AdCreative,
  AdPerformance,
  AdPlatformId,
  Campaign,
  CampaignObjective,
  CampaignStatus,
  DevelopmentType,
  PolicyCheckStatus,
  PolicyReview,
  Poster,
  PosterConcept,
  PosterFormat,
  PosterType,
  Simulation,
  Timelapse,
  TimelapseAspect,
  TimelapseMedia,
  AdlyInsight,
} from "@/types/adly";
import { asString, isRecord } from "@/server/content/parse";
import { createId, slugify } from "@/lib/store";

function posterLayout(value: unknown): PosterConcept["layout"] {
  if (value === "hero-left" || value === "hero-full" || value === "split" || value === "minimal") return value;
  return "hero-full";
}

function mediaType(value: unknown): TimelapseMedia["type"] {
  if (value === "image" || value === "video" || value === "drone" || value === "satellite") return value;
  return "image";
}

function mediaPhase(value: unknown): TimelapseMedia["phase"] {
  if (value === "before" || value === "during" || value === "after") return value;
  return "during";
}

const PLATFORMS: readonly AdPlatformId[] = [
  "meta",
  "instagram",
  "facebook",
  "whatsapp",
  "tiktok",
  "google",
  "x",
];
const OBJECTIVES: readonly CampaignObjective[] = [
  "awareness",
  "reach",
  "engagement",
  "traffic",
  "leads",
  "community-support",
  "project-visibility",
];
const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "in-review",
  "active",
  "paused",
  "completed",
];
const POSTER_TYPES: readonly PosterType[] = [
  "campaign",
  "development-project",
  "event",
  "community-message",
  "manifesto",
  "announcement",
  "achievement",
];
const POSTER_FORMATS: readonly PosterFormat[] = ["1080x1350", "1080x1080", "1920x1080"];
const ASPECTS: readonly TimelapseAspect[] = ["16:9", "9:16", "1:1"];
const DEVELOPMENT: readonly DevelopmentType[] = [
  "hospital",
  "road",
  "housing",
  "water",
  "market",
  "sports",
  "industrial",
  "transport",
  "school",
  "other",
];
const POLICY: readonly PolicyCheckStatus[] = ["passed", "review", "needs-attention"];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function num(value: unknown, fallback: number, min = 0): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function platforms(value: unknown, existing?: AdPlatformId[]): AdPlatformId[] {
  if (!Array.isArray(value)) return existing?.length ? existing : ["google"];
  const next = value.filter((item): item is AdPlatformId => PLATFORMS.includes(item as AdPlatformId));
  return next.length ? next : existing?.length ? existing : ["google"];
}

function performance(value: unknown, existing?: AdPerformance): AdPerformance {
  const source = isRecord(value) ? value : {};
  const base: AdPerformance = existing ?? {
    spend: 0,
    reach: 0,
    impressions: 0,
    engagement: 0,
    ctr: 0,
    conversions: 0,
    currency: "KES",
  };
  return {
    spend: "spend" in source ? num(source.spend, base.spend) : base.spend,
    reach: "reach" in source ? num(source.reach, base.reach) : base.reach,
    impressions: "impressions" in source ? num(source.impressions, base.impressions) : base.impressions,
    engagement: "engagement" in source ? num(source.engagement, base.engagement) : base.engagement,
    ctr: "ctr" in source ? num(source.ctr, base.ctr) : base.ctr,
    conversions: "conversions" in source ? num(source.conversions, base.conversions) : base.conversions,
    currency: ("currency" in source ? asString(source.currency) : undefined) ?? base.currency,
  };
}

export function parseCampaign(body: unknown, existing?: Campaign): Campaign | string {
  if (!isRecord(body)) return "Campaign body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  if (!name) return "Campaign name is required.";
  const leaderId = "leaderId" in body ? asString(body.leaderId) : existing?.leaderId;
  if (!leaderId) return "Campaign leaderId is required.";
  const id = asString(body.id) ?? existing?.id ?? createId("cmp");
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  const targetingSource = isRecord(body.targeting) ? body.targeting : {};
  const existingTarget = existing?.targeting;
  return {
    id,
    slug: slugSource || slugify(name) || id,
    name,
    objective: "objective" in body
      ? oneOf(body.objective, OBJECTIVES, "awareness")
      : existing?.objective ?? "awareness",
    status: "status" in body
      ? oneOf(body.status, CAMPAIGN_STATUSES, "draft")
      : existing?.status ?? "draft",
    platformIds: "platformIds" in body ? platforms(body.platformIds, existing?.platformIds) : existing?.platformIds ?? ["google"],
    leaderId,
    projectId: "projectId" in body ? asString(body.projectId) : existing?.projectId,
    targeting: {
      country: ("country" in targetingSource ? asString(targetingSource.country) : existingTarget?.country) ?? "Kenya",
      county: "county" in targetingSource ? asString(targetingSource.county) : existingTarget?.county,
      constituency: "constituency" in targetingSource ? asString(targetingSource.constituency) : existingTarget?.constituency,
      ward: "ward" in targetingSource ? asString(targetingSource.ward) : existingTarget?.ward,
      radiusKm: "radiusKm" in targetingSource ? num(targetingSource.radiusKm, existingTarget?.radiusKm ?? 0) : existingTarget?.radiusKm,
    },
    startDate: ("startDate" in body ? asString(body.startDate) : existing?.startDate) ?? new Date().toISOString().slice(0, 10),
    endDate: ("endDate" in body ? asString(body.endDate) : existing?.endDate) ?? new Date().toISOString().slice(0, 10),
    budget: "budget" in body ? num(body.budget, 0) : existing?.budget ?? 0,
    currency: ("currency" in body ? asString(body.currency) : existing?.currency) ?? "KES",
    creativeIds: "creativeIds" in body ? ids(body.creativeIds) : existing?.creativeIds ?? [],
    performance: "performance" in body ? performance(body.performance, existing?.performance) : existing?.performance ?? performance(undefined),
    policyReviewId: "policyReviewId" in body ? asString(body.policyReviewId) : existing?.policyReviewId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function parseCreative(body: unknown, existing?: AdCreative): AdCreative | string {
  if (!isRecord(body)) return "Creative body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  const headline = "headline" in body ? asString(body.headline) : existing?.headline;
  if (!name && !headline) return "Creative name or headline is required.";
  return {
    id: asString(body.id) ?? existing?.id ?? createId("cr"),
    name: name ?? headline ?? "Creative",
    headline: headline ?? name ?? "",
    body: ("body" in body ? asString(body.body) : existing?.body) ?? "",
    cta: ("cta" in body ? asString(body.cta) : existing?.cta) ?? "See the work",
    image: ("image" in body ? asString(body.image) : existing?.image) ?? "",
    platformIds: "platformIds" in body ? platforms(body.platformIds, existing?.platformIds) : existing?.platformIds ?? ["google"],
    performance: "performance" in body ? performance(body.performance, existing?.performance) : existing?.performance,
  };
}

export function parsePolicyReview(body: unknown, existing?: PolicyReview): PolicyReview | string {
  if (!isRecord(body)) return "Policy review body must be an object.";
  const campaignId = "campaignId" in body ? asString(body.campaignId) : existing?.campaignId;
  if (!campaignId) return "Policy review campaignId is required.";
  const checks = "checks" in body && Array.isArray(body.checks)
    ? body.checks.flatMap((check) => {
        if (!isRecord(check)) return [];
        const label = asString(check.label);
        if (!label) return [];
        return [
          {
            id: asString(check.id) ?? createId("chk"),
            label,
            status: oneOf(check.status, POLICY, "review"),
            note: asString(check.note) ?? "",
          },
        ];
      })
    : existing?.checks ?? [];
  return {
    id: asString(body.id) ?? existing?.id ?? createId("prv"),
    campaignId,
    status: "status" in body ? oneOf(body.status, POLICY, "review") : existing?.status ?? "review",
    checks,
    disclaimer:
      ("disclaimer" in body ? asString(body.disclaimer) : existing?.disclaimer) ??
      "Final approval is determined by the advertising platform.",
    reviewedAt: ("reviewedAt" in body ? asString(body.reviewedAt) : existing?.reviewedAt) ?? new Date().toISOString(),
  };
}

export function parsePoster(body: unknown, existing?: Poster): Poster | string {
  if (!isRecord(body)) return "Poster body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  const headline = "headline" in body ? asString(body.headline) : existing?.headline;
  if (!name && !headline) return "Poster name or headline is required.";
  const leaderId = "leaderId" in body ? asString(body.leaderId) : existing?.leaderId;
  if (!leaderId) return "Poster leaderId is required.";
  const concepts = "concepts" in body && Array.isArray(body.concepts)
    ? body.concepts.flatMap((concept) => {
        if (!isRecord(concept)) return [];
        const label = asString(concept.label);
        if (!label) return [];
        return [
          {
            id: asString(concept.id) ?? createId("pcpt"),
            label,
            layout: posterLayout(concept.layout),
            accent: asString(concept.accent) ?? "#e5b12a",
          },
        ];
      })
    : existing?.concepts ?? [];
  return {
    id: asString(body.id) ?? existing?.id ?? createId("pst"),
    name: name ?? headline ?? "Poster",
    leaderId,
    projectId: "projectId" in body ? asString(body.projectId) : existing?.projectId,
    type: "type" in body ? oneOf(body.type, POSTER_TYPES, "campaign") : existing?.type ?? "campaign",
    format: "format" in body ? oneOf(body.format, POSTER_FORMATS, "1080x1350") : existing?.format ?? "1080x1350",
    headline: headline ?? name ?? "",
    supporting: ("supporting" in body ? asString(body.supporting) : existing?.supporting) ?? "",
    cta: ("cta" in body ? asString(body.cta) : existing?.cta) ?? "See the work",
    date: "date" in body ? asString(body.date) : existing?.date,
    location: "location" in body ? asString(body.location) : existing?.location,
    portrait: "portrait" in body ? asString(body.portrait) : existing?.portrait,
    projectImage: "projectImage" in body ? asString(body.projectImage) : existing?.projectImage,
    logo: "logo" in body ? asString(body.logo) : existing?.logo,
    concepts,
    selectedConceptId: "selectedConceptId" in body ? asString(body.selectedConceptId) : existing?.selectedConceptId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function parseTimelapse(body: unknown, existing?: Timelapse): Timelapse | string {
  if (!isRecord(body)) return "Timelapse body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  const projectId = "projectId" in body ? asString(body.projectId) : existing?.projectId;
  if (!name) return "Timelapse name is required.";
  if (!projectId) return "Timelapse projectId is required.";
  const media = "media" in body && Array.isArray(body.media)
    ? body.media.flatMap((item, index) => {
        if (!isRecord(item)) return [];
        const url = asString(item.url);
        if (!url) return [];
        return [
          {
            id: asString(item.id) ?? createId("tlm"),
            type: mediaType(item.type),
            url,
            caption: asString(item.caption) ?? "",
            capturedAt: asString(item.capturedAt) ?? new Date().toISOString().slice(0, 10),
            phase: mediaPhase(item.phase),
            order: num(item.order, index),
          },
        ];
      })
    : existing?.media ?? [];
  return {
    id: asString(body.id) ?? existing?.id ?? createId("tl"),
    name,
    projectId,
    location: ("location" in body ? asString(body.location) : existing?.location) ?? "",
    startDate: ("startDate" in body ? asString(body.startDate) : existing?.startDate) ?? new Date().toISOString().slice(0, 10),
    endDate: ("endDate" in body ? asString(body.endDate) : existing?.endDate) ?? new Date().toISOString().slice(0, 10),
    progress: "progress" in body ? Math.min(100, num(body.progress, 0)) : existing?.progress ?? 0,
    aspect: "aspect" in body ? oneOf(body.aspect, ASPECTS, "16:9") : existing?.aspect ?? "16:9",
    media,
    milestones: "milestones" in body ? ids(body.milestones) : existing?.milestones ?? [],
    captionsEnabled: "captionsEnabled" in body ? Boolean(body.captionsEnabled) : existing?.captionsEnabled ?? true,
    brandingEnabled: "brandingEnabled" in body ? Boolean(body.brandingEnabled) : existing?.brandingEnabled ?? true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
}

export function parseSimulation(body: unknown, existing?: Simulation): Simulation | string {
  if (!isRecord(body)) return "Simulation body must be an object.";
  const title = "title" in body ? asString(body.title) : existing?.title;
  if (!title) return "Simulation title is required.";
  const geoSource = isRecord(body.geo) ? body.geo : undefined;
  const lat = geoSource ? Number(geoSource.lat) : existing?.geo.lat ?? -1.2864;
  const lng = geoSource ? Number(geoSource.lng) : existing?.geo.lng ?? 36.8172;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "Simulation coordinates must be numbers.";
  const style = body.style;
  return {
    id: asString(body.id) ?? existing?.id ?? createId("sim"),
    title,
    description: ("description" in body ? asString(body.description) : existing?.description) ?? "",
    developmentType: "developmentType" in body
      ? oneOf(body.developmentType, DEVELOPMENT, "other")
      : existing?.developmentType ?? "other",
    locationLabel: ("locationLabel" in body ? asString(body.locationLabel) : existing?.locationLabel) ?? "",
    geo: { lat, lng },
    expectedOutcome: ("expectedOutcome" in body ? asString(body.expectedOutcome) : existing?.expectedOutcome) ?? "",
    style: style === "photoreal" || style === "architectural" || style === "conceptual"
      ? style
      : existing?.style ?? "conceptual",
    beforeImage: ("beforeImage" in body ? asString(body.beforeImage) : existing?.beforeImage) ?? "",
    afterImage: ("afterImage" in body ? asString(body.afterImage) : existing?.afterImage) ?? "",
    leaderId: "leaderId" in body ? asString(body.leaderId) : existing?.leaderId,
    projectId: "projectId" in body ? asString(body.projectId) : existing?.projectId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    isAiSimulation: true,
  };
}

export function parseInsight(body: unknown, existing?: AdlyInsight): AdlyInsight | string {
  if (!isRecord(body)) return "Insight body must be an object.";
  const title = "title" in body ? asString(body.title) : existing?.title;
  if (!title) return "Insight title is required.";
  const tone = body.tone;
  return {
    id: asString(body.id) ?? existing?.id ?? createId("ins"),
    tone: tone === "positive" || tone === "neutral" || tone === "attention" ? tone : existing?.tone ?? "neutral",
    title,
    body: ("body" in body ? asString(body.body) : existing?.body) ?? "",
    relatedCampaignId: "relatedCampaignId" in body ? asString(body.relatedCampaignId) : existing?.relatedCampaignId,
    relatedCreativeId: "relatedCreativeId" in body ? asString(body.relatedCreativeId) : existing?.relatedCreativeId,
  };
}
