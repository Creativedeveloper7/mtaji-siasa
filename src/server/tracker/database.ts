import "server-only";
import type {
  AdCampaignRepository,
  AppRepositories,
  ContentRepository,
  WalletRepository,
} from "@/server/repositories";
import { createTrackerUserRepository } from "@/server/tracker/users";
import { reportWarning } from "@/server/tracker/warnings";
import { createLeaderRepository, type LeaderLinksProvider } from "@/server/tracker/content/leaders";
import {
  createProjectRepository,
  projectDonationCount,
  projectIdsForFigures,
  projectOwnerUserId,
} from "@/server/tracker/content/projects";
import {
  createApplicationRepository,
  createEngagementRepository,
  createOpportunityRepository,
  opportunityIdsByAuthor,
} from "@/server/tracker/content/opportunities";
import { createMediaRepository, mediaIdsByAuthor } from "@/server/tracker/content/media/repository";
import { createPollRepository, pollIdsByOwner } from "@/server/tracker/content/polls/repository";
import { createProductRepository, productIdsByAuthor } from "@/server/tracker/content/products/repository";

/** A store that has no Tracker equivalent in Siasa. The API answers with `status`. */
export class TrackerUnavailableError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "TrackerUnavailableError";
  }
}

function unavailable(message: string, status = 410): never {
  throw new TrackerUnavailableError(status, message);
}

/**
 * Leader → content links (docs/content-mapping.md §3). Content hangs off the
 * figure's auth user (political_figures.user_id), projects also off
 * commissioned_projects. One batched query per kind for every figure read.
 */
export const trackerLeaderLinks: LeaderLinksProvider = async (figures) => {
  const userIds = [...new Set(figures.map((f) => f.userId).filter((id): id is string => Boolean(id)))];
  const [projects, opportunities, media, polls, products] = await Promise.all([
    projectIdsForFigures(
      figures.map((f) => ({ id: f.id, user_id: f.userId, commissioned_projects: f.commissionedProjects }))
    ),
    opportunityIdsByAuthor(userIds),
    mediaIdsByAuthor(userIds),
    pollIdsByOwner(userIds),
    productIdsByAuthor(userIds),
  ]);
  const links = new Map<string, { projectIds: string[]; opportunityIds: string[]; mediaIds: string[]; pollIds: string[]; productIds: string[] }>();
  for (const figure of figures) {
    const byUser = (map: Map<string, string[]>) => (figure.userId ? map.get(figure.userId) ?? [] : []);
    links.set(figure.id, {
      projectIds: projects.get(figure.id) ?? [],
      opportunityIds: byUser(opportunities),
      mediaIds: byUser(media),
      pollIds: byUser(polls),
      productIds: byUser(products),
    });
  }
  return links;
};

/**
 * ContentRepository on the Tracker tables, composed from the content slices.
 * Link arrays (Leader.projectIds, Project.opportunityIds, ...) are derived on
 * read, so writes to them are ignored. reset() never touches Tracker data.
 */
export function createTrackerContentRepository(): ContentRepository {
  const leaders = createLeaderRepository({ links: trackerLeaderLinks, onWarning: reportWarning });
  const projects = createProjectRepository({ onWarning: reportWarning });
  const opportunities = createOpportunityRepository();
  const media = createMediaRepository();
  const polls = createPollRepository();
  const products = createProductRepository();

  return {
    ...leaders,
    ...projects,
    ...opportunities,
    ...media,
    ...polls,
    ...products,
    async snapshot() {
      const [l, p, m, o, md, pl, pr] = await Promise.all([
        leaders.listLeaders(),
        projects.listProjects(),
        projects.listMilestones(),
        opportunities.listOpportunities(),
        media.listMedia(),
        polls.listPolls(),
        products.listProducts(),
      ]);
      return { leaders: l, projects: p, milestones: m, opportunities: o, media: md, polls: pl, products: pr };
    },
    async reset() {
      unavailable("Content lives in the M-Taji Tracker database and is never reset from Siasa.", 403);
    },
    projectOwnerUserId: (projectId: string) => projectOwnerUserId(projectId),
    projectDonationCount: (projectId: string) => projectDonationCount(projectId),
  };
}

/**
 * The Tracker wallet is real money and has its own routes
 * (/api/wallet/payments*, src/server/tracker/wallet). The legacy wallet store
 * must never stand in for it, so every call fails.
 */
const noWallets: WalletRepository = {
  listLeaderIds: async () => unavailable("Use /api/wallet/payments."),
  get: async () => unavailable("Use /api/wallet/payments."),
  save: async () => unavailable("Use /api/wallet/payments."),
};

/** Paid ads run on adly_campaigns (src/server/tracker/adly) on the Tracker backend. */
const noAdCampaigns: AdCampaignRepository = {
  list: async () => unavailable("Use /api/ads/campaigns."),
  find: async () => unavailable("Use /api/ads/campaigns."),
  upsert: async () => unavailable("Use /api/ads/campaigns."),
};

/**
 * Repositories backed by the M-Taji Tracker Supabase project.
 *
 * - users, content, applications, engagement: Tracker tables.
 * - wallets, adCampaigns: not here. The Tracker wallet and Adly ads have their
 *   own services and routes; these stores throw (410) so nothing can fall back
 *   to a fake wallet or a memory campaign.
 * - adly (the studio's posters, simulations, creatives...): still the memory
 *   adapter passed in. Adly campaigns themselves are adly_campaigns
 *   (src/server/tracker/adly).
 */
export function createTrackerRepositories(memory: AppRepositories): AppRepositories {
  const users = createTrackerUserRepository();
  const content = createTrackerContentRepository();
  return {
    users,
    content,
    adly: memory.adly,
    wallets: noWallets,
    engagement: createEngagementRepository(),
    applications: createApplicationRepository(),
    adCampaigns: noAdCampaigns,
    counts: async () => {
      const [memoryCounts, snapshot, userCount] = await Promise.all([
        memory.counts(),
        content.snapshot(),
        users.count().catch(() => 0),
      ]);
      return {
        ...memoryCounts,
        users: userCount,
        leaders: snapshot.leaders.length,
        projects: snapshot.projects.length,
        milestones: snapshot.milestones.length,
        opportunities: snapshot.opportunities.length,
        media: snapshot.media.length,
        polls: snapshot.polls.length,
        products: snapshot.products.length,
        // Tracker-only stores are not counted here (they need a session or the service role).
        wallets: 0,
        savedOpportunityLists: 0,
        adlyInterests: 0,
        applications: 0,
        adCampaigns: 0,
      };
    },
    /** Never resets Tracker data. Only the memory-backed Adly studio could be reset, and that is /api/adly/reset. */
    resetAll: async () => unavailable("Tracker data is never reset from Siasa.", 403),
  };
}
