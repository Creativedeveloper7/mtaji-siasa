import type {
  Leader,
  MediaItem,
  Opportunity,
  Poll,
  Product,
  Project,
  ProjectMilestone,
} from "@/types";
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
import type { PlatformContent } from "@/lib/store";
import type {
  AdlyInterestLead,
  NewUserInput,
  PublicUser,
  SeedCounts,
  WalletRecord,
} from "@/server/domain";

/**
 * Accounts. Password hashes stay inside the repository.
 * Lookups return PublicUser and never include a password or hash.
 */
export interface UserRepository {
  count(): number;
  listPublic(): PublicUser[];
  findById(id: string): PublicUser | undefined;
  findByEmail(email: string): PublicUser | undefined;
  /** False for an unknown email and for a wrong password. */
  verifyPassword(email: string, password: string): boolean;
  create(input: NewUserInput): PublicUser;
  update(user: PublicUser): PublicUser | undefined;
  setPassword(id: string, password: string): boolean;
  delete(id: string): boolean;
}

export interface ContentRepository {
  snapshot(): PlatformContent;
  reset(): void;
  listLeaders(): Leader[];
  findLeader(id: string): Leader | undefined;
  findLeaderBySlug(slug: string): Leader | undefined;
  upsertLeader(item: Leader): Leader;
  deleteLeader(id: string): boolean;
  listProjects(): Project[];
  findProject(id: string): Project | undefined;
  findProjectBySlug(slug: string): Project | undefined;
  listProjectsByIds(ids: string[]): Project[];
  upsertProject(item: Project): Project;
  deleteProject(id: string): boolean;
  listMilestones(): ProjectMilestone[];
  findMilestone(id: string): ProjectMilestone | undefined;
  listMilestonesByProject(projectId: string): ProjectMilestone[];
  upsertMilestone(item: ProjectMilestone): ProjectMilestone;
  deleteMilestone(id: string): boolean;
  listOpportunities(): Opportunity[];
  findOpportunity(id: string): Opportunity | undefined;
  findOpportunityBySlug(slug: string): Opportunity | undefined;
  listOpportunitiesByIds(ids: string[]): Opportunity[];
  upsertOpportunity(item: Opportunity): Opportunity;
  deleteOpportunity(id: string): boolean;
  listMedia(): MediaItem[];
  findMedia(id: string): MediaItem | undefined;
  findMediaBySlug(slug: string): MediaItem | undefined;
  listMediaByIds(ids: string[]): MediaItem[];
  upsertMedia(item: MediaItem): MediaItem;
  deleteMedia(id: string): boolean;
  listPolls(): Poll[];
  findPoll(id: string): Poll | undefined;
  findPollBySlug(slug: string): Poll | undefined;
  listPollsByIds(ids: string[]): Poll[];
  upsertPoll(item: Poll): Poll;
  deletePoll(id: string): boolean;
  listProducts(): Product[];
  findProduct(id: string): Product | undefined;
  findProductBySlug(slug: string): Product | undefined;
  listProductsByLeader(leaderId: string): Product[];
  upsertProduct(item: Product): Product;
  deleteProduct(id: string): boolean;
}

export interface AdlyRepository {
  snapshot(): AdlyContent;
  /** Replace the whole Adly document. Used when a record type has no single-row delete. */
  replace(content: AdlyContent): void;
  reset(): void;
  listCampaigns(): Campaign[];
  findCampaign(id: string): Campaign | undefined;
  upsertCampaign(item: Campaign): Campaign;
  deleteCampaign(id: string): boolean;
  listCreatives(): AdCreative[];
  findCreative(id: string): AdCreative | undefined;
  upsertCreative(item: AdCreative): AdCreative;
  listPolicyReviews(): PolicyReview[];
  findPolicyReview(id: string): PolicyReview | undefined;
  upsertPolicyReview(item: PolicyReview): PolicyReview;
  listPosters(): Poster[];
  findPoster(id: string): Poster | undefined;
  upsertPoster(item: Poster): Poster;
  listTimelapses(): Timelapse[];
  findTimelapse(id: string): Timelapse | undefined;
  upsertTimelapse(item: Timelapse): Timelapse;
  listSimulations(): Simulation[];
  findSimulation(id: string): Simulation | undefined;
  upsertSimulation(item: Simulation): Simulation;
  listInsights(): AdlyInsight[];
  addInsight(item: AdlyInsight): AdlyInsight;
}

export interface WalletRepository {
  /** Saved wallets only. Leaders with no top-up yet are absent. */
  listLeaderIds(): string[];
  /**
   * Returns the saved wallet, or the default balances when nothing is stored.
   * Defaults are not written until save().
   */
  get(leaderId: string): WalletRecord;
  save(record: WalletRecord): WalletRecord;
}

export interface EngagementRepository {
  getSavedOpportunityIds(userId: string): string[];
  setSavedOpportunityIds(userId: string, ids: string[]): string[];
  listAdlyInterests(): AdlyInterestLead[];
  addAdlyInterest(
    input: Omit<AdlyInterestLead, "id"> & { id?: string }
  ): AdlyInterestLead;
}

export interface AppRepositories {
  users: UserRepository;
  content: ContentRepository;
  adly: AdlyRepository;
  wallets: WalletRepository;
  engagement: EngagementRepository;
  counts(): SeedCounts;
  /** Restore seed content and drop wallets, saves, and leads. */
  resetAll(): void;
}
