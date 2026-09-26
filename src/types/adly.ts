/** Adly — campaign & advertising domain models */

export type AdPlatformId =
  | "meta"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "tiktok"
  | "google"
  | "x";

export type CampaignObjective =
  | "awareness"
  | "reach"
  | "engagement"
  | "traffic"
  | "leads"
  | "community-support"
  | "project-visibility";

export type CampaignStatus =
  | "draft"
  | "in-review"
  | "active"
  | "paused"
  | "completed";

export type PolicyCheckStatus = "passed" | "review" | "needs-attention";

export type PosterType =
  | "campaign"
  | "development-project"
  | "event"
  | "community-message"
  | "manifesto"
  | "announcement"
  | "achievement";

export type PosterFormat = "1080x1350" | "1080x1080" | "1920x1080";

export type TimelapseAspect = "16:9" | "9:16" | "1:1";

export type DevelopmentType =
  | "hospital"
  | "road"
  | "housing"
  | "water"
  | "market"
  | "sports"
  | "industrial"
  | "transport"
  | "school"
  | "other";

export interface AdPlatform {
  id: AdPlatformId;
  name: string;
  description: string;
  /** Live / selectable in Adly today */
  available: boolean;
  /** Group under Meta family in the UI */
  family?: "meta";
}

export interface GeoTargeting {
  country: string;
  county?: string;
  constituency?: string;
  ward?: string;
  radiusKm?: number;
  center?: { lat: number; lng: number };
}

export interface AdCreative {
  id: string;
  name: string;
  headline: string;
  body: string;
  cta: string;
  image: string;
  platformIds: AdPlatformId[];
  performance?: AdPerformance;
}

export interface AdPerformance {
  spend: number;
  reach: number;
  impressions: number;
  engagement: number;
  ctr: number;
  conversions: number;
  currency: string;
}

export interface PolicyCheckItem {
  id: string;
  label: string;
  status: PolicyCheckStatus;
  note: string;
}

export interface PolicyReview {
  id: string;
  campaignId: string;
  status: PolicyCheckStatus;
  checks: PolicyCheckItem[];
  disclaimer: string;
  reviewedAt: string;
}

export interface Campaign {
  id: string;
  slug: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  platformIds: AdPlatformId[];
  leaderId: string;
  projectId?: string;
  targeting: GeoTargeting;
  startDate: string;
  endDate: string;
  budget: number;
  currency: string;
  creativeIds: string[];
  performance: AdPerformance;
  policyReviewId?: string;
  createdAt: string;
}

export interface PosterConcept {
  id: string;
  label: string;
  layout: "hero-left" | "hero-full" | "split" | "minimal";
  accent: string;
}

export interface Poster {
  id: string;
  name: string;
  leaderId: string;
  projectId?: string;
  type: PosterType;
  format: PosterFormat;
  headline: string;
  supporting: string;
  cta: string;
  date?: string;
  location?: string;
  portrait?: string;
  projectImage?: string;
  logo?: string;
  concepts: PosterConcept[];
  selectedConceptId?: string;
  createdAt: string;
}

export interface TimelapseMedia {
  id: string;
  type: "image" | "video" | "drone" | "satellite";
  url: string;
  caption: string;
  capturedAt: string;
  phase: "before" | "during" | "after";
  order: number;
}

export interface Timelapse {
  id: string;
  name: string;
  projectId: string;
  location: string;
  startDate: string;
  endDate: string;
  progress: number;
  aspect: TimelapseAspect;
  media: TimelapseMedia[];
  milestones: string[];
  captionsEnabled: boolean;
  brandingEnabled: boolean;
  createdAt: string;
}

export interface Simulation {
  id: string;
  title: string;
  description: string;
  developmentType: DevelopmentType;
  locationLabel: string;
  geo: { lat: number; lng: number };
  expectedOutcome: string;
  style: "photoreal" | "architectural" | "conceptual";
  beforeImage: string;
  afterImage: string;
  leaderId?: string;
  projectId?: string;
  createdAt: string;
  /** Always true for generated visuals */
  isAiSimulation: true;
}

export interface AdlyInsight {
  id: string;
  tone: "positive" | "neutral" | "attention";
  title: string;
  body: string;
  relatedCampaignId?: string;
  relatedCreativeId?: string;
}

export interface AdlyWorkspaceStats {
  activeCampaigns: number;
  totalSpend: number;
  reach: number;
  impressions: number;
  engagement: number;
  avgCtr: number;
  conversions: number;
  currency: string;
  policyAttentionCount: number;
}

export interface AdlyContent {
  campaigns: Campaign[];
  creatives: AdCreative[];
  policyReviews: PolicyReview[];
  posters: Poster[];
  timelapses: Timelapse[];
  simulations: Simulation[];
  insights: AdlyInsight[];
}
