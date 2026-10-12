export type LeaderType = "elected" | "aspirant";

export type ProjectCategory = "infrastructure" | "non-infrastructure";

export type ProjectStatus =
  | "planned"
  | "in-progress"
  | "completed"
  | "on-hold";

export type OpportunityCategory =
  | "jobs"
  | "tenders"
  | "training"
  | "funding"
  | "youth"
  | "business"
  | "other";

export type MediaCategory =
  | "news"
  | "project-updates"
  | "leader-updates"
  | "videos"
  | "stories";

export type MediaType = "image" | "video" | "article";

export type MilestoneStatus = "completed" | "current" | "upcoming";

export interface SocialLinks {
  x?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  whatsapp?: string;
  website?: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoBounds {
  type: "Polygon";
  coordinates: number[][][];
}

export interface Leader {
  id: string;
  slug: string;
  name: string;
  honorific: string;
  /** Manual free-text office/position — never forced to a dropdown */
  position: string;
  type: LeaderType;
  county: string;
  constituency?: string;
  ward?: string;
  photo: string;
  coverImage?: string;
  shortBio: string;
  bio: string;
  achievements: string[];
  social: SocialLinks;
  projectIds: string[];
  opportunityIds: string[];
  mediaIds: string[];
  pollIds: string[];
  productIds: string[];
  vision?: Vision;
}

export interface Vision {
  statement: string;
  manifesto: string[];
  priorities: string[];
  proposedProjects: ProposedProject[];
  expectedImpact: string[];
}

export interface ProposedProject {
  id: string;
  title: string;
  description: string;
  location: string;
  category: ProjectCategory;
  simulationImage: string;
  expectedImpact: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  category: ProjectCategory;
  subcategory: string;
  location: string;
  county: string;
  status: ProjectStatus;
  progress: number;
  image: string;
  description: string;
  startDate: string;
  expectedCompletion: string;
  leaderIds: string[];
  geo: {
    center: GeoPoint;
    boundary?: GeoBounds;
  };
  milestoneIds: string[];
  opportunityIds: string[];
  mediaIds: string[];
  /** The project is looking for people, suppliers or partners through linked opportunities */
  requiresOpportunities?: boolean;
}

export interface ProjectMilestone {
  id: string;
  projectId: string;
  number: number;
  date: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  image?: string;
}

export type OpportunityStatus = "open" | "closing-soon" | "closed";

export interface Opportunity {
  id: string;
  slug: string;
  title: string;
  category: OpportunityCategory;
  location: string;
  county: string;
  deadline: string;
  eligibility: string;
  description: string;
  image?: string;
  projectId?: string;
  leaderId?: string;
  /** Optional enrichment for detail pages */
  status?: OpportunityStatus;
  openingDate?: string;
  benefits?: string[];
  requirements?: string[];
  applicationSteps?: string[];
  organization?: string;
  applicationUrl?: string;
  relatedMediaIds?: string[];
}

export interface MediaItem {
  id: string;
  slug: string;
  title: string;
  category: MediaCategory;
  type: MediaType;
  image: string;
  /** Extra photos shown as a gallery on the story page. The cover stays in `image`. */
  gallery?: string[];
  date: string;
  excerpt: string;
  body?: string;
  videoUrl?: string;
  leaderId?: string;
  projectId?: string;
  /** Optional enrichment for detail pages */
  updatedAt?: string;
  author?: string;
  relatedOpportunityIds?: string[];
  relatedMediaIds?: string[];
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface Poll {
  id: string;
  slug: string;
  question: string;
  options: PollOption[];
  closingDate: string;
  leaderId?: string;
  participationCount: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  currency: string;
  image: string;
  description: string;
  /** Pieces available for request */
  stock: number;
  leaderId: string;
}

export type ApplicationStatus =
  | "submitted"
  | "reviewing"
  | "shortlisted"
  | "accepted"
  | "rejected";

export interface OpportunityApplication {
  id: string;
  opportunityId: string;
  /** Account that applied */
  applicantId: string;
  fullName: string;
  email: string;
  phone: string;
  county?: string;
  message: string;
  /** Optional link to a CV, portfolio or company profile */
  attachmentUrl?: string;
  status: ApplicationStatus;
  /** Note from the opportunity owner, visible to the applicant */
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** An application plus the opportunity fields the dashboards show next to it. */
export type ApplicationView = OpportunityApplication & {
  opportunity: Pick<Opportunity, "id" | "slug" | "title" | "category" | "deadline"> & {
    projectId?: string;
    leaderId?: string;
  };
};

export type AdPlatform = "x" | "google";

export type AdCampaignStatus =
  | "pending_approval"
  | "launching"
  | "active"
  | "paused"
  | "completed"
  | "failed"
  | "rejected"
  | "stopped";

/** What happened on one ad network for a campaign. */
export interface AdPlatformRun {
  platform: AdPlatform;
  /** Share of the budget for this network, KES */
  budgetKes: number;
  status: "pending" | "live" | "paused" | "failed" | "ended";
  /** Network ids, kept so the campaign can be paused, resumed and measured */
  externalIds?: Record<string, string>;
  error?: string;
  impressions?: number;
  clicks?: number;
  /** Spend reported by the network, converted to KES */
  spentKes?: number;
  syncedAt?: string;
}

export interface AdCampaign {
  id: string;
  leaderId: string;
  /** Account that created it */
  createdBy: string;
  projectId: string;
  name: string;
  headline: string;
  body: string;
  imageUrl: string;
  landingUrl: string;
  keywords: string[];
  platforms: AdPlatformRun[];
  budgetKes: number;
  durationDays: number;
  /** Estimated people reached, from AD_REACH_PER_KES */
  estimatedReach: number;
  /** KES per USD used to convert the budget for the networks */
  kesPerUsd: number;
  status: AdCampaignStatus;
  statusNote?: string;
  startDate?: string;
  endDate?: string;
  refundedKes: number;
  createdAt: string;
  updatedAt: string;
}
