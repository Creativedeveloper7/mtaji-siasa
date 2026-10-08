import type {
  Leader,
  MediaItem,
  Opportunity,
  Poll,
  Product,
  Project,
  ProjectMilestone,
} from "@/types";
import type { UserRole } from "@/types/auth";
import type {
  AdCreative,
  AdlyContent,
  AdlyInsight,
  Campaign,
  PolicyReview,
  Poster,
  Simulation,
  Timelapse,
} from "@/types/adly";
import { createSeedAdlyContent } from "@/data/adly";
import {
  createSeedContent,
  createSeedUsers,
  createId,
  type PlatformContent,
} from "@/lib/store";
import {
  dummyPasswordHash,
  hashPassword,
  verifyPasswordHash,
} from "@/server/auth/password";
import {
  defaultWallet,
  type AdlyInterestLead,
  type PublicUser,
  type SeedCounts,
  type WalletRecord,
} from "@/server/domain";
import type { AppRepositories } from "@/server/repositories";

interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  leaderId?: string;
}

interface MemoryState {
  users: StoredUser[];
  content: PlatformContent;
  adly: AdlyContent;
  wallets: Record<string, WalletRecord>;
  savedOpportunities: Record<string, string[]>;
  adlyInterests: AdlyInterestLead[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function toPublic(user: StoredUser): PublicUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    leaderId: user.leaderId,
  };
}

function createSeedState(): MemoryState {
  return {
    users: createSeedUsers().map((account) => ({
      id: account.id,
      fullName: account.fullName,
      email: account.email.trim().toLowerCase(),
      phone: account.phone,
      passwordHash: hashPassword(account.password),
      role: account.role,
      createdAt: account.createdAt,
      leaderId: account.leaderId,
    })),
    content: createSeedContent(),
    adly: createSeedAdlyContent(),
    wallets: {},
    savedOpportunities: {},
    adlyInterests: [],
  };
}

function upsertIn<T extends { id: string }>(list: T[], item: T): T[] {
  const copy = clone(item);
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...list, copy];
  const next = list.slice();
  next[index] = copy;
  return next;
}

function byId<T extends { id: string }>(list: T[], id: string): T | undefined {
  const found = list.find((entry) => entry.id === id);
  return found ? clone(found) : undefined;
}

function bySlug<T extends { slug: string }>(
  list: T[],
  slug: string
): T | undefined {
  const found = list.find((entry) => entry.slug === slug);
  return found ? clone(found) : undefined;
}

/**
 * Process-local store. Data lives until the Node process restarts.
 * A SQL repository will implement the same AppRepositories interface later.
 */
export function createMemoryRepositories(): AppRepositories {
  const state = createSeedState();

  const users: AppRepositories["users"] = {
    count: () => state.users.length,
    listPublic: () => state.users.map((account) => toPublic(account)),
    findById: (id) => {
      const found = state.users.find((account) => account.id === id);
      return found ? toPublic(found) : undefined;
    },
    findByEmail: (email) => {
      const found = findStoredUser(email);
      return found ? toPublic(found) : undefined;
    },
    verifyPassword: (email, password) => {
      const found = findStoredUser(email);
      const hash = found?.passwordHash ?? dummyPasswordHash();
      const matches = verifyPasswordHash(password, hash);
      return Boolean(found) && matches;
    },
    create: (input) => {
      const email = input.email.trim().toLowerCase();
      if (findStoredUser(email)) {
        throw new Error("An account with this email already exists.");
      }
      const account: StoredUser = {
        id: input.id || createId("usr"),
        fullName: input.fullName.trim(),
        email,
        phone: input.phone.trim(),
        passwordHash: hashPassword(input.password),
        role: input.role,
        createdAt: input.createdAt || new Date().toISOString(),
        leaderId: input.leaderId,
      };
      state.users = [...state.users, account];
      return toPublic(account);
    },
    update: (user) => {
      const existing = state.users.find((account) => account.id === user.id);
      if (!existing) return undefined;
      const email = user.email.trim().toLowerCase();
      const taken = state.users.some(
        (account) => account.email === email && account.id !== user.id
      );
      if (taken) {
        throw new Error("An account with this email already exists.");
      }
      existing.fullName = user.fullName.trim();
      existing.email = email;
      existing.phone = user.phone.trim();
      existing.role = user.role;
      existing.createdAt = user.createdAt;
      existing.leaderId = user.leaderId;
      return toPublic(existing);
    },
    setPassword: (id, password) => {
      const existing = state.users.find((account) => account.id === id);
      if (!existing) return false;
      existing.passwordHash = hashPassword(password);
      return true;
    },
    delete: (id) => {
      const next = state.users.filter((account) => account.id !== id);
      const removed = next.length !== state.users.length;
      state.users = next;
      return removed;
    },
  };

  function findStoredUser(email: string): StoredUser | undefined {
    const normalized = email.trim().toLowerCase();
    return state.users.find((account) => account.email === normalized);
  }

  const content: AppRepositories["content"] = {
    snapshot: () => clone(state.content),
    reset: () => {
      state.content = createSeedContent();
    },
    listLeaders: () => clone(state.content.leaders),
    findLeader: (id) => byId(state.content.leaders, id),
    findLeaderBySlug: (slug) => bySlug(state.content.leaders, slug),
    upsertLeader: (item) => {
      state.content.leaders = upsertIn(state.content.leaders, item);
      return byId(state.content.leaders, item.id) as Leader;
    },
    deleteLeader: (id) => removeById("leaders", id),
    listProjects: () => clone(state.content.projects),
    findProject: (id) => byId(state.content.projects, id),
    findProjectBySlug: (slug) => bySlug(state.content.projects, slug),
    listProjectsByIds: (ids) =>
      clone(state.content.projects.filter((item) => ids.includes(item.id))),
    upsertProject: (item) => {
      state.content.projects = upsertIn(state.content.projects, item);
      return byId(state.content.projects, item.id) as Project;
    },
    deleteProject: (id) => removeById("projects", id),
    listMilestones: () => clone(state.content.milestones),
    findMilestone: (id) => byId(state.content.milestones, id),
    listMilestonesByProject: (projectId) =>
      clone(
        state.content.milestones
          .filter((item) => item.projectId === projectId)
          .sort((a, b) => a.number - b.number)
      ),
    upsertMilestone: (item) => {
      state.content.milestones = upsertIn(state.content.milestones, item);
      return byId(state.content.milestones, item.id) as ProjectMilestone;
    },
    deleteMilestone: (id) => removeById("milestones", id),
    listOpportunities: () => clone(state.content.opportunities),
    findOpportunity: (id) => byId(state.content.opportunities, id),
    findOpportunityBySlug: (slug) => bySlug(state.content.opportunities, slug),
    listOpportunitiesByIds: (ids) =>
      clone(
        state.content.opportunities.filter((item) => ids.includes(item.id))
      ),
    upsertOpportunity: (item) => {
      state.content.opportunities = upsertIn(state.content.opportunities, item);
      return byId(state.content.opportunities, item.id) as Opportunity;
    },
    deleteOpportunity: (id) => removeById("opportunities", id),
    listMedia: () => clone(state.content.media),
    findMedia: (id) => byId(state.content.media, id),
    findMediaBySlug: (slug) => bySlug(state.content.media, slug),
    listMediaByIds: (ids) =>
      clone(state.content.media.filter((item) => ids.includes(item.id))),
    upsertMedia: (item) => {
      state.content.media = upsertIn(state.content.media, item);
      return byId(state.content.media, item.id) as MediaItem;
    },
    deleteMedia: (id) => removeById("media", id),
    listPolls: () => clone(state.content.polls),
    findPoll: (id) => byId(state.content.polls, id),
    findPollBySlug: (slug) => bySlug(state.content.polls, slug),
    listPollsByIds: (ids) =>
      clone(state.content.polls.filter((item) => ids.includes(item.id))),
    upsertPoll: (item) => {
      state.content.polls = upsertIn(state.content.polls, item);
      return byId(state.content.polls, item.id) as Poll;
    },
    deletePoll: (id) => removeById("polls", id),
    listProducts: () => clone(state.content.products),
    findProduct: (id) => byId(state.content.products, id),
    findProductBySlug: (slug) => bySlug(state.content.products, slug),
    listProductsByLeader: (leaderId) =>
      clone(
        state.content.products.filter((item) => item.leaderId === leaderId)
      ),
    upsertProduct: (item) => {
      state.content.products = upsertIn(state.content.products, item);
      return byId(state.content.products, item.id) as Product;
    },
    deleteProduct: (id) => removeById("products", id),
  };

  function removeById(key: keyof PlatformContent, id: string): boolean {
    const list = state.content[key];
    const next = list.filter((item) => item.id !== id);
    const removed = next.length !== list.length;
    state.content = { ...state.content, [key]: next };
    return removed;
  }

  const adly: AppRepositories["adly"] = {
    snapshot: () => clone(state.adly),
    replace: (content) => {
      state.adly = clone(content);
    },
    reset: () => {
      state.adly = createSeedAdlyContent();
    },
    listCampaigns: () => clone(state.adly.campaigns),
    findCampaign: (id) => byId(state.adly.campaigns, id),
    upsertCampaign: (item) => {
      state.adly.campaigns = upsertIn(state.adly.campaigns, item);
      return byId(state.adly.campaigns, item.id) as Campaign;
    },
    deleteCampaign: (id) => {
      const next = state.adly.campaigns.filter((item) => item.id !== id);
      const removed = next.length !== state.adly.campaigns.length;
      state.adly.campaigns = next;
      return removed;
    },
    listCreatives: () => clone(state.adly.creatives),
    findCreative: (id) => byId(state.adly.creatives, id),
    upsertCreative: (item) => {
      state.adly.creatives = upsertIn(state.adly.creatives, item);
      return byId(state.adly.creatives, item.id) as AdCreative;
    },
    listPolicyReviews: () => clone(state.adly.policyReviews),
    findPolicyReview: (id) => byId(state.adly.policyReviews, id),
    upsertPolicyReview: (item) => {
      state.adly.policyReviews = upsertIn(state.adly.policyReviews, item);
      return byId(state.adly.policyReviews, item.id) as PolicyReview;
    },
    listPosters: () => clone(state.adly.posters),
    findPoster: (id) => byId(state.adly.posters, id),
    upsertPoster: (item) => {
      state.adly.posters = upsertIn(state.adly.posters, item);
      return byId(state.adly.posters, item.id) as Poster;
    },
    listTimelapses: () => clone(state.adly.timelapses),
    findTimelapse: (id) => byId(state.adly.timelapses, id),
    upsertTimelapse: (item) => {
      state.adly.timelapses = upsertIn(state.adly.timelapses, item);
      return byId(state.adly.timelapses, item.id) as Timelapse;
    },
    listSimulations: () => clone(state.adly.simulations),
    findSimulation: (id) => byId(state.adly.simulations, id),
    upsertSimulation: (item) => {
      state.adly.simulations = upsertIn(state.adly.simulations, item);
      return byId(state.adly.simulations, item.id) as Simulation;
    },
    listInsights: () => clone(state.adly.insights),
    addInsight: (item) => {
      const insight = clone(item);
      state.adly.insights = [insight, ...state.adly.insights];
      return clone(insight);
    },
  };

  const wallets: AppRepositories["wallets"] = {
    listLeaderIds: () => Object.keys(state.wallets),
    get: (leaderId) => {
      const saved = state.wallets[leaderId];
      return saved ? clone(saved) : defaultWallet(leaderId);
    },
    save: (record) => {
      const saved = clone(record);
      state.wallets[record.leaderId] = saved;
      return clone(saved);
    },
  };

  const engagement: AppRepositories["engagement"] = {
    getSavedOpportunityIds: (userId) =>
      clone(state.savedOpportunities[userId] ?? []),
    setSavedOpportunityIds: (userId, ids) => {
      const next = [...new Set(ids)];
      state.savedOpportunities[userId] = next;
      return clone(next);
    },
    listAdlyInterests: () => clone(state.adlyInterests),
    addAdlyInterest: (input) => {
      const lead: AdlyInterestLead = {
        ...input,
        id: input.id || createId("lead"),
      };
      state.adlyInterests = [clone(lead), ...state.adlyInterests];
      return clone(lead);
    },
  };

  function counts(): SeedCounts {
    return {
      users: state.users.length,
      leaders: state.content.leaders.length,
      projects: state.content.projects.length,
      milestones: state.content.milestones.length,
      opportunities: state.content.opportunities.length,
      media: state.content.media.length,
      polls: state.content.polls.length,
      products: state.content.products.length,
      campaigns: state.adly.campaigns.length,
      creatives: state.adly.creatives.length,
      policyReviews: state.adly.policyReviews.length,
      posters: state.adly.posters.length,
      timelapses: state.adly.timelapses.length,
      simulations: state.adly.simulations.length,
      insights: state.adly.insights.length,
      wallets: Object.keys(state.wallets).length,
      savedOpportunityLists: Object.keys(state.savedOpportunities).length,
      adlyInterests: state.adlyInterests.length,
    };
  }

  const repositories: AppRepositories = {
    users,
    content,
    adly,
    wallets,
    engagement,
    counts,
    resetAll: () => {
      const seed = createSeedState();
      state.users = seed.users;
      state.content = seed.content;
      state.adly = seed.adly;
      state.wallets = seed.wallets;
      state.savedOpportunities = seed.savedOpportunities;
      state.adlyInterests = seed.adlyInterests;
    },
  };

  assertMemoryAdapter(repositories);
  return repositories;
}

/** Fails server startup if seed data did not load or callers can mutate stored rows. */
function assertMemoryAdapter(repos: AppRepositories) {
  const leader = repos.content.findLeaderBySlug("amara-njehia");
  if (!leader) throw new Error("Seed leader amara-njehia did not load.");
  const admin = repos.users.findByEmail("admin@mtaji.ke");
  if (!admin) throw new Error("Seed admin account did not load.");
  if ("password" in admin || "passwordHash" in admin) {
    throw new Error("User lookup exposed credentials.");
  }
  if (!repos.users.verifyPassword("admin@mtaji.ke", "Admin@2026")) {
    throw new Error("Seed admin password did not verify.");
  }
  if (repos.users.verifyPassword("admin@mtaji.ke", "wrong-password")) {
    throw new Error("Password check accepted a wrong password.");
  }
  const probe = repos.users.create({
    fullName: "Memory Probe",
    email: "probe-auth@mtaji.ke",
    phone: "+254700000099",
    password: "Probe@2026",
    role: "citizen",
  });
  if (!repos.users.verifyPassword(probe.email, "Probe@2026")) {
    throw new Error("Created account password did not verify.");
  }
  if (!repos.users.delete(probe.id)) {
    throw new Error("Probe account was not removed.");
  }

  const snapshot = repos.content.snapshot();
  snapshot.leaders[0].name = "mutated-by-caller";
  const reread = repos.content.findLeader(snapshot.leaders[0].id);
  if (!reread || reread.name === "mutated-by-caller") {
    throw new Error("Content repository returned a live reference.");
  }

  const probeId = "ldr-memory-probe";
  repos.content.upsertLeader({
    ...leader,
    id: probeId,
    slug: "memory-probe",
    name: "Memory Probe",
  });
  if (repos.content.findLeaderBySlug("memory-probe")?.name !== "Memory Probe") {
    throw new Error("Leader upsert did not persist.");
  }
  if (repos.content.findLeaderBySlug("amara-njehia")?.id !== leader.id) {
    throw new Error("Leader upsert changed the seed record.");
  }
  if (!repos.content.deleteLeader(probeId)) {
    throw new Error("Leader delete did not remove the probe.");
  }

  const wallet = repos.wallets.get(leader.id);
  if (wallet.sources.crowdfunding !== 185000) {
    throw new Error("Default wallet balances did not load.");
  }
  wallet.sources.crowdfunding = 1;
  if (repos.wallets.get(leader.id).sources.crowdfunding !== 185000) {
    throw new Error("Wallet repository returned a live reference.");
  }
}
