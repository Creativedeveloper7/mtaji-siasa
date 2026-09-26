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
