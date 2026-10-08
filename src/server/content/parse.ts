import type {
  Leader,
  MediaCategory,
  MediaItem,
  MediaType,
  MilestoneStatus,
  Opportunity,
  OpportunityCategory,
  Poll,
  Product,
  Project,
  ProjectCategory,
  ProjectMilestone,
  ProjectStatus,
  SocialLinks,
} from "@/types";
import { createId, slugify } from "@/lib/store";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const PROJECT_CATEGORIES = ["infrastructure", "non-infrastructure"] as const;
const PROJECT_STATUSES = ["planned", "in-progress", "completed", "on-hold"] as const;
const MILESTONE_STATUSES = ["completed", "current", "upcoming"] as const;
const OPPORTUNITY_CATEGORIES = ["jobs", "tenders", "training", "funding", "youth", "business", "other"] as const;
const MEDIA_CATEGORIES = ["news", "project-updates", "leader-updates", "videos", "stories"] as const;
const MEDIA_TYPES = ["image", "video", "article"] as const;

function social(value: unknown, existing?: SocialLinks): SocialLinks {
  const source = isRecord(value) ? value : {};
  const base = existing ?? {};
  const next: SocialLinks = { ...base };
  for (const key of ["x", "instagram", "facebook", "tiktok", "whatsapp", "website"] as const) {
    if (isRecord(value) && key in source) {
      const text = asString(source[key]);
      if (text) next[key] = text;
      else delete next[key];
    }
  }
  return next;
}

function vision(value: unknown, existing: Leader["vision"]): Leader["vision"] {
  if (!isRecord(value)) return existing;
  const proposed = Array.isArray(value.proposedProjects) ? value.proposedProjects : [];
  return {
    statement: asString(value.statement) ?? existing?.statement ?? "",
    manifesto: "manifesto" in value ? stringList(value.manifesto) : existing?.manifesto ?? [],
    priorities: "priorities" in value ? stringList(value.priorities) : existing?.priorities ?? [],
    expectedImpact:
      "expectedImpact" in value ? stringList(value.expectedImpact) : existing?.expectedImpact ?? [],
    proposedProjects: "proposedProjects" in value
      ? proposed.flatMap((item) => {
          if (!isRecord(item)) return [];
          const title = asString(item.title);
          if (!title) return [];
          return [
            {
              id: asString(item.id) ?? createId("prop"),
              title,
              description: asString(item.description) ?? "",
              location: asString(item.location) ?? "",
              category: oneOf(item.category, PROJECT_CATEGORIES, "infrastructure"),
              simulationImage: asString(item.simulationImage) ?? "",
              expectedImpact: asString(item.expectedImpact) ?? "",
            },
          ];
        })
      : existing?.proposedProjects ?? [],
  };
}

export function parseLeader(body: unknown, existing?: Leader): Leader | string {
  if (!isRecord(body)) return "Leader body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  if (!name) return "Leader name is required.";
  const id = asString(body.id) ?? existing?.id ?? createId("ldr");
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  return {
    id,
    slug: slugSource || slugify(name) || id,
    name,
    honorific: ("honorific" in body ? asString(body.honorific) : existing?.honorific) ?? "Hon.",
    position: ("position" in body ? asString(body.position) : existing?.position) ?? "",
    type: "type" in body ? (body.type === "aspirant" ? "aspirant" : "elected") : existing?.type ?? "elected",
    county: ("county" in body ? asString(body.county) : existing?.county) ?? "Nairobi",
    constituency: "constituency" in body ? asString(body.constituency) : existing?.constituency,
    ward: "ward" in body ? asString(body.ward) : existing?.ward,
    photo:
      ("photo" in body ? asString(body.photo) : existing?.photo) ??
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
    coverImage: "coverImage" in body ? asString(body.coverImage) : existing?.coverImage,
    shortBio: ("shortBio" in body ? asString(body.shortBio) : existing?.shortBio) ?? "",
    bio: ("bio" in body ? asString(body.bio) : existing?.bio) ?? "",
    achievements: "achievements" in body ? stringList(body.achievements) : existing?.achievements ?? [],
    social: "social" in body ? social(body.social, existing?.social) : existing?.social ?? {},
    projectIds: "projectIds" in body ? stringList(body.projectIds) : existing?.projectIds ?? [],
    opportunityIds: "opportunityIds" in body ? stringList(body.opportunityIds) : existing?.opportunityIds ?? [],
    mediaIds: "mediaIds" in body ? stringList(body.mediaIds) : existing?.mediaIds ?? [],
    pollIds: "pollIds" in body ? stringList(body.pollIds) : existing?.pollIds ?? [],
    productIds: "productIds" in body ? stringList(body.productIds) : existing?.productIds ?? [],
    vision: "vision" in body ? vision(body.vision, undefined) : existing?.vision,
  };
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function geo(value: unknown, existing?: Project["geo"]): Project["geo"] | string {
  if (value == null) {
    return existing ?? { center: { lat: -1.2864, lng: 36.8172 } };
  }
  if (!isRecord(value) || !isRecord(value.center)) return "Project geo.center with lat and lng is required.";
  const lat = Number(value.center.lat);
  const lng = Number(value.center.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "Project coordinates must be numbers.";
  }
  const boundary = isRecord(value.boundary) ? value.boundary : undefined;
  return {
    center: { lat, lng },
    boundary:
      boundary?.type === "Polygon" && Array.isArray(boundary.coordinates)
        ? { type: "Polygon", coordinates: boundary.coordinates as number[][][] }
        : existing?.boundary,
  };
}

export function parseProject(body: unknown, existing?: Project): Project | string {
  if (!isRecord(body)) return "Project body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  if (!name) return "Project name is required.";
  const id = asString(body.id) ?? existing?.id ?? createId("prj");
  const parsedGeo = "geo" in body ? geo(body.geo, existing?.geo) : existing?.geo ?? geo(undefined);
  if (typeof parsedGeo === "string") return parsedGeo;
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  return {
    id,
    slug: slugSource || slugify(name) || id,
    name,
    category: ("category" in body
      ? oneOf<ProjectCategory>(body.category, PROJECT_CATEGORIES, "infrastructure")
      : existing?.category ?? "infrastructure"),
    subcategory: ("subcategory" in body ? asString(body.subcategory) : existing?.subcategory) ?? "General",
    location: ("location" in body ? asString(body.location) : existing?.location) ?? "",
    county: ("county" in body ? asString(body.county) : existing?.county) ?? "Nairobi",
    status: ("status" in body
      ? oneOf<ProjectStatus>(body.status, PROJECT_STATUSES, "planned")
      : existing?.status ?? "planned"),
    progress: "progress" in body ? numberIn(body.progress, 0, 0, 100) : existing?.progress ?? 0,
    image: ("image" in body ? asString(body.image) : existing?.image) ?? "",
    description: ("description" in body ? asString(body.description) : existing?.description) ?? "",
    startDate: ("startDate" in body ? asString(body.startDate) : existing?.startDate) ?? new Date().toISOString().slice(0, 10),
    expectedCompletion:
      ("expectedCompletion" in body ? asString(body.expectedCompletion) : existing?.expectedCompletion) ??
      new Date().toISOString().slice(0, 10),
    leaderIds: "leaderIds" in body ? stringList(body.leaderIds) : existing?.leaderIds ?? [],
    geo: parsedGeo,
    milestoneIds: "milestoneIds" in body ? stringList(body.milestoneIds) : existing?.milestoneIds ?? [],
    opportunityIds: "opportunityIds" in body ? stringList(body.opportunityIds) : existing?.opportunityIds ?? [],
    mediaIds: "mediaIds" in body ? stringList(body.mediaIds) : existing?.mediaIds ?? [],
  };
}

export function parseMilestone(body: unknown, existing?: ProjectMilestone): ProjectMilestone | string {
  if (!isRecord(body)) return "Milestone body must be an object.";
  const title = "title" in body ? asString(body.title) : existing?.title;
  const projectId = "projectId" in body ? asString(body.projectId) : existing?.projectId;
  if (!title) return "Milestone title is required.";
  if (!projectId) return "Milestone projectId is required.";
  return {
    id: asString(body.id) ?? existing?.id ?? createId("ms"),
    projectId,
    number: "number" in body ? numberIn(body.number, existing?.number ?? 1, 1, 999) : existing?.number ?? 1,
    date: ("date" in body ? asString(body.date) : existing?.date) ?? new Date().toISOString().slice(0, 10),
    title,
    description: ("description" in body ? asString(body.description) : existing?.description) ?? "",
    status: ("status" in body
      ? oneOf<MilestoneStatus>(body.status, MILESTONE_STATUSES, "upcoming")
      : existing?.status ?? "upcoming"),
    image: "image" in body ? asString(body.image) : existing?.image,
  };
}

export function parseOpportunity(body: unknown, existing?: Opportunity): Opportunity | string {
  if (!isRecord(body)) return "Opportunity body must be an object.";
  const title = "title" in body ? asString(body.title) : existing?.title;
  if (!title) return "Opportunity title is required.";
  const id = asString(body.id) ?? existing?.id ?? createId("opp");
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  return {
    id,
    slug: slugSource || slugify(title) || id,
    title,
    category: ("category" in body
      ? oneOf<OpportunityCategory>(body.category, OPPORTUNITY_CATEGORIES, "other")
      : existing?.category ?? "other"),
    location: ("location" in body ? asString(body.location) : existing?.location) ?? "",
    county: ("county" in body ? asString(body.county) : existing?.county) ?? "Nairobi",
    deadline: ("deadline" in body ? asString(body.deadline) : existing?.deadline) ?? "",
    eligibility: ("eligibility" in body ? asString(body.eligibility) : existing?.eligibility) ?? "",
    description: ("description" in body ? asString(body.description) : existing?.description) ?? "",
    image: "image" in body ? asString(body.image) : existing?.image,
    projectId: "projectId" in body ? asString(body.projectId) : existing?.projectId,
    leaderId: "leaderId" in body ? asString(body.leaderId) : existing?.leaderId,
    status: "status" in body && (body.status === "open" || body.status === "closing-soon" || body.status === "closed")
      ? body.status
      : existing?.status,
    openingDate: "openingDate" in body ? asString(body.openingDate) : existing?.openingDate,
    benefits: "benefits" in body ? stringList(body.benefits) : existing?.benefits,
    requirements: "requirements" in body ? stringList(body.requirements) : existing?.requirements,
    applicationSteps: "applicationSteps" in body ? stringList(body.applicationSteps) : existing?.applicationSteps,
    organization: "organization" in body ? asString(body.organization) : existing?.organization,
    applicationUrl: "applicationUrl" in body ? asString(body.applicationUrl) : existing?.applicationUrl,
    relatedMediaIds: "relatedMediaIds" in body ? stringList(body.relatedMediaIds) : existing?.relatedMediaIds,
  };
}

export function parseMedia(body: unknown, existing?: MediaItem): MediaItem | string {
  if (!isRecord(body)) return "Media body must be an object.";
  const title = "title" in body ? asString(body.title) : existing?.title;
  if (!title) return "Media title is required.";
  const id = asString(body.id) ?? existing?.id ?? createId("med");
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  return {
    id,
    slug: slugSource || slugify(title) || id,
    title,
    category: ("category" in body
      ? oneOf<MediaCategory>(body.category, MEDIA_CATEGORIES, "news")
      : existing?.category ?? "news"),
    type: ("type" in body
      ? oneOf<MediaType>(body.type, MEDIA_TYPES, "article")
      : existing?.type ?? "article"),
    image: ("image" in body ? asString(body.image) : existing?.image) ?? "",
    date: ("date" in body ? asString(body.date) : existing?.date) ?? new Date().toISOString().slice(0, 10),
    excerpt: ("excerpt" in body ? asString(body.excerpt) : existing?.excerpt) ?? "",
    body: "body" in body ? asString(body.body) : existing?.body,
    videoUrl: "videoUrl" in body ? asString(body.videoUrl) : existing?.videoUrl,
    leaderId: "leaderId" in body ? asString(body.leaderId) : existing?.leaderId,
    projectId: "projectId" in body ? asString(body.projectId) : existing?.projectId,
    updatedAt: "updatedAt" in body ? asString(body.updatedAt) : existing?.updatedAt,
    author: "author" in body ? asString(body.author) : existing?.author,
    relatedOpportunityIds:
      "relatedOpportunityIds" in body ? stringList(body.relatedOpportunityIds) : existing?.relatedOpportunityIds,
    relatedMediaIds: "relatedMediaIds" in body ? stringList(body.relatedMediaIds) : existing?.relatedMediaIds,
  };
}

export function parsePoll(body: unknown, existing?: Poll): Poll | string {
  if (!isRecord(body)) return "Poll body must be an object.";
  const question = "question" in body ? asString(body.question) : existing?.question;
  if (!question) return "Poll question is required.";
  const options = "options" in body
    ? Array.isArray(body.options)
      ? body.options.flatMap((option) => {
          if (!isRecord(option)) return [];
          const label = asString(option.label);
          if (!label) return [];
          return [
            {
              id: asString(option.id) ?? createId("opt"),
              label,
              votes: numberIn(option.votes, 0, 0, 1_000_000_000),
            },
          ];
        })
      : null
    : existing?.options ?? [];
  if (!options || options.length === 0) return "A poll needs at least one option.";
  const id = asString(body.id) ?? existing?.id ?? createId("pol");
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  const participation = options.reduce((sum, option) => sum + option.votes, 0);
  return {
    id,
    slug: slugSource || slugify(question) || id,
    question,
    options,
    closingDate: ("closingDate" in body ? asString(body.closingDate) : existing?.closingDate) ?? "",
    leaderId: "leaderId" in body ? asString(body.leaderId) : existing?.leaderId,
    participationCount:
      "participationCount" in body ? numberIn(body.participationCount, participation, 0, 1_000_000_000) : existing?.participationCount ?? participation,
  };
}

export function parseProduct(body: unknown, existing?: Product): Product | string {
  if (!isRecord(body)) return "Product body must be an object.";
  const name = "name" in body ? asString(body.name) : existing?.name;
  if (!name) return "Product name is required.";
  const leaderId = "leaderId" in body ? asString(body.leaderId) : existing?.leaderId;
  if (!leaderId) return "Product leaderId is required.";
  const id = asString(body.id) ?? existing?.id ?? createId("prd");
  const slugSource = "slug" in body ? asString(body.slug) : existing?.slug;
  return {
    id,
    slug: slugSource || slugify(name) || id,
    name,
    price: "price" in body ? numberIn(body.price, 0, 0, 100_000_000) : existing?.price ?? 0,
    currency: ("currency" in body ? asString(body.currency) : existing?.currency) ?? "KES",
    image: ("image" in body ? asString(body.image) : existing?.image) ?? "",
    description: ("description" in body ? asString(body.description) : existing?.description) ?? "",
    stock: "stock" in body ? numberIn(body.stock, 0, 0, 1_000_000) : existing?.stock ?? 0,
    leaderId,
  };
}
