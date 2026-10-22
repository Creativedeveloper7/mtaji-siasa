import type {
  Leader,
  MediaItem,
  Opportunity,
  OpportunityApplication,
  AdCampaign,
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
 * Account directory. Credentials belong to Supabase Auth: a password passed to
 * create() or setPassword() goes to the auth provider and is never stored or
 * returned here.
 */
export interface UserRepository {
  count(): Promise<number>;
  listPublic(): Promise<PublicUser[]>;
  findById(id: string): Promise<PublicUser | undefined>;
  findByEmail(email: string): Promise<PublicUser | undefined>;
  create(input: NewUserInput): Promise<PublicUser>;
  update(user: PublicUser): Promise<PublicUser | undefined>;
  setPassword(id: string, password: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

export interface ContentRepository {
  snapshot(): Promise<PlatformContent>;
  reset(): Promise<void>;
  listLeaders(): Promise<Leader[]>;
  findLeader(id: string): Promise<Leader | undefined>;
  findLeaderBySlug(slug: string): Promise<Leader | undefined>;
  upsertLeader(item: Leader): Promise<Leader>;
  deleteLeader(id: string): Promise<boolean>;
  listProjects(): Promise<Project[]>;
  findProject(id: string): Promise<Project | undefined>;
  findProjectBySlug(slug: string): Promise<Project | undefined>;
  listProjectsByIds(ids: string[]): Promise<Project[]>;
  upsertProject(item: Project): Promise<Project>;
  deleteProject(id: string): Promise<boolean>;
  listMilestones(): Promise<ProjectMilestone[]>;
  findMilestone(id: string): Promise<ProjectMilestone | undefined>;
  listMilestonesByProject(projectId: string): Promise<ProjectMilestone[]>;
  upsertMilestone(item: ProjectMilestone): Promise<ProjectMilestone>;
  deleteMilestone(id: string): Promise<boolean>;
  listOpportunities(): Promise<Opportunity[]>;
  findOpportunity(id: string): Promise<Opportunity | undefined>;
  findOpportunityBySlug(slug: string): Promise<Opportunity | undefined>;
  listOpportunitiesByIds(ids: string[]): Promise<Opportunity[]>;
  upsertOpportunity(item: Opportunity): Promise<Opportunity>;
  deleteOpportunity(id: string): Promise<boolean>;
  listMedia(): Promise<MediaItem[]>;
  findMedia(id: string): Promise<MediaItem | undefined>;
  findMediaBySlug(slug: string): Promise<MediaItem | undefined>;
  listMediaByIds(ids: string[]): Promise<MediaItem[]>;
  upsertMedia(item: MediaItem): Promise<MediaItem>;
  deleteMedia(id: string): Promise<boolean>;
  listPolls(): Promise<Poll[]>;
  findPoll(id: string): Promise<Poll | undefined>;
  findPollBySlug(slug: string): Promise<Poll | undefined>;
  listPollsByIds(ids: string[]): Promise<Poll[]>;
  upsertPoll(item: Poll): Promise<Poll>;
  deletePoll(id: string): Promise<boolean>;
  listProducts(): Promise<Product[]>;
  findProduct(id: string): Promise<Product | undefined>;
  findProductBySlug(slug: string): Promise<Product | undefined>;
  listProductsByLeader(leaderId: string): Promise<Product[]>;
  upsertProduct(item: Product): Promise<Product>;
  deleteProduct(id: string): Promise<boolean>;
  /**
   * Tracker only: the auth user id that owns a project (changemakers.user_id),
   * for the Ownership rule (docs/tracker-backend.md). Absent in memory mode.
   */
  projectOwnerUserId?(projectId: string): Promise<string | undefined>;
}

export interface AdlyRepository {
  snapshot(): Promise<AdlyContent>;
  /** Replace the whole Adly document. Used when a record type has no single-row delete. */
  replace(content: AdlyContent): Promise<void>;
  reset(): Promise<void>;
  listCampaigns(): Promise<Campaign[]>;
  findCampaign(id: string): Promise<Campaign | undefined>;
  upsertCampaign(item: Campaign): Promise<Campaign>;
  deleteCampaign(id: string): Promise<boolean>;
  listCreatives(): Promise<AdCreative[]>;
  findCreative(id: string): Promise<AdCreative | undefined>;
  upsertCreative(item: AdCreative): Promise<AdCreative>;
  listPolicyReviews(): Promise<PolicyReview[]>;
  findPolicyReview(id: string): Promise<PolicyReview | undefined>;
  upsertPolicyReview(item: PolicyReview): Promise<PolicyReview>;
  listPosters(): Promise<Poster[]>;
  findPoster(id: string): Promise<Poster | undefined>;
  upsertPoster(item: Poster): Promise<Poster>;
  listTimelapses(): Promise<Timelapse[]>;
  findTimelapse(id: string): Promise<Timelapse | undefined>;
  upsertTimelapse(item: Timelapse): Promise<Timelapse>;
  listSimulations(): Promise<Simulation[]>;
  findSimulation(id: string): Promise<Simulation | undefined>;
  upsertSimulation(item: Simulation): Promise<Simulation>;
  listInsights(): Promise<AdlyInsight[]>;
  addInsight(item: AdlyInsight): Promise<AdlyInsight>;
}

export interface WalletRepository {
  /** Saved wallets only. Leaders with no top-up yet are absent. */
  listLeaderIds(): Promise<string[]>;
  /**
   * Returns the saved wallet, or the default balances when nothing is stored.
   * Defaults are not written until save().
   */
  get(leaderId: string): Promise<WalletRecord>;
  save(record: WalletRecord): Promise<WalletRecord>;
}

export interface EngagementRepository {
  getSavedOpportunityIds(userId: string): Promise<string[]>;
  setSavedOpportunityIds(userId: string, ids: string[]): Promise<string[]>;
  listAdlyInterests(): Promise<AdlyInterestLead[]>;
  addAdlyInterest(
    input: Omit<AdlyInterestLead, "id"> & { id?: string }
  ): Promise<AdlyInterestLead>;
}

/**
 * Applications are read straight from the store on every call (no shared cache),
 * so an owner always sees applications submitted through any server instance.
 */
export interface ApplicationRepository {
  list(): Promise<OpportunityApplication[]>;
  find(id: string): Promise<OpportunityApplication | undefined>;
  upsert(item: OpportunityApplication): Promise<OpportunityApplication>;
  delete(id: string): Promise<boolean>;
}

/** Paid ad campaigns. Read straight from the store, like applications. */
export interface AdCampaignRepository {
  list(): Promise<AdCampaign[]>;
  find(id: string): Promise<AdCampaign | undefined>;
  upsert(item: AdCampaign): Promise<AdCampaign>;
}

/** Every method returns a Promise, whichever store backs it. */
export interface AppRepositories {
  users: UserRepository;
  content: ContentRepository;
  adly: AdlyRepository;
  wallets: WalletRepository;
  engagement: EngagementRepository;
  applications: ApplicationRepository;
  adCampaigns: AdCampaignRepository;
  counts(): Promise<SeedCounts>;
  /** Restore seed content and drop wallets, saves, and leads. */
  resetAll(): Promise<void>;
}
