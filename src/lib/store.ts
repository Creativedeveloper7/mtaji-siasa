import type {
  Leader,
  MediaItem,
  Opportunity,
  Poll,
  Product,
  Project,
  ProjectMilestone,
} from "@/types";
import type { UserAccount } from "@/types/auth";
import { leaders as seedLeaders } from "@/data/leaders";
import {
  projects as seedProjects,
  milestones as seedMilestones,
} from "@/data/projects";
import { opportunities as seedOpportunities } from "@/data/opportunities";
import { mediaItems as seedMedia } from "@/data/media";
import { polls as seedPolls } from "@/data/polls";
import { products as seedProducts } from "@/data/products";

export const CONTENT_STORAGE_KEY = "mtaji-siasa-content-v1";
export const USERS_STORAGE_KEY = "mtaji-siasa-users-v1";
export const SESSION_STORAGE_KEY = "mtaji-siasa-session-v1";

export interface PlatformContent {
  leaders: Leader[];
  projects: Project[];
  milestones: ProjectMilestone[];
  opportunities: Opportunity[];
  media: MediaItem[];
  polls: Poll[];
  products: Product[];
}

export function createSeedContent(): PlatformContent {
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  return {
    leaders: clone(seedLeaders),
    projects: clone(seedProjects),
    milestones: clone(seedMilestones),
    opportunities: clone(seedOpportunities),
    media: clone(seedMedia),
    polls: clone(seedPolls),
    products: clone(seedProducts),
  };
}

export function createSeedUsers(): UserAccount[] {
  return [
    {
      id: "usr-admin",
      fullName: "Platform Admin",
      email: "admin@mtaji.ke",
      phone: "+254700000000",
      password: "Admin@2026",
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "usr-citizen",
      fullName: "Amina Citizen",
      email: "citizen@mtaji.ke",
      phone: "+254711000100",
      password: "Citizen@2026",
      role: "citizen",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "usr-leader",
      fullName: "Amara Njehia",
      email: "leader@mtaji.ke",
      phone: "+254711000001",
      password: "Leader@2026",
      role: "leader",
      leaderId: "ldr-001",
      createdAt: "2026-01-03T00:00:00.000Z",
    },
    {
      id: "usr-aspirant",
      fullName: "Fatuma Hassan",
      email: "aspirant@mtaji.ke",
      phone: "+254711000003",
      password: "Aspirant@2026",
      role: "aspirant",
      leaderId: "ldr-003",
      createdAt: "2026-01-04T00:00:00.000Z",
    },
  ];
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}
