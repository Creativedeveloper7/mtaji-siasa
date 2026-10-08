import { createId, type PlatformContent } from "@/lib/store";
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
  type WalletMovement,
  type WalletRecord,
} from "@/server/domain";
import type { AppRepositories } from "@/server/repositories";
import {
  adlySeedCalls,
  contentSeedCalls,
  scopePoll,
  seedAdlyShape,
  seedContentShape,
  userSeedCalls,
} from "@/server/supabase/seed";
import {
  rpc,
  rpcSync,
  supabaseBatchSync,
  supabaseCall,
  supabaseCallSync,
  type SupabaseCall,
} from "@/server/supabase/rpc";
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
import type {
  Leader,
  MediaItem,
  Opportunity,
  Poll,
  Product,
  Project,
  ProjectMilestone,
} from "@/types";

type WalletRow = {
  leader_id: string;
  crowdfunding: number | string;
  merchandise: number | string;
  donations: number | string;
  transfers: number | string;
  last_top_up_at: string | null;
  last_withdrawal_at: string | null;
};

type MovementRow = {
  id: string;
  leader_id: string;
  kind: WalletMovement["kind"];
  amount: number | string;
  source: WalletMovement["source"] | null;
  created_at: string;
};

type SavedRow = {
  user_id: string;
  opportunity_id: string;
  position: number;
};

type Cache = {
  ready: true;
  users: PublicUser[];
  content: PlatformContent;
  adly: AdlyContent;
  wallets: Record<string, WalletRecord>;
  saved: Record<string, string[]>;
  leads: AdlyInterestLead[];
};

const globalStore = globalThis as typeof globalThis & {
  __mtajiSupabase?: Cache;
};

function copy<T>(value: T): T {
  return structuredClone(value);
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : "Database error";
  if (message.includes("users_email_lower") || message.toLowerCase().includes("duplicate key")) {
    throw new Error("An account with this email already exists.");
  }
  throw new Error(message);
}

function asContent(value: Partial<PlatformContent> | null): PlatformContent {
  return {
    leaders: value?.leaders ?? [],
    projects: value?.projects ?? [],
    milestones: value?.milestones ?? [],
    opportunities: value?.opportunities ?? [],
    media: value?.media ?? [],
    polls: value?.polls ?? [],
    products: value?.products ?? [],
  };
}

function asAdly(value: Partial<AdlyContent> | null): AdlyContent {
  return {
    campaigns: value?.campaigns ?? [],
    creatives: value?.creatives ?? [],
    policyReviews: value?.policyReviews ?? [],
    posters: value?.posters ?? [],
    timelapses: value?.timelapses ?? [],
    simulations: value?.simulations ?? [],
    insights: value?.insights ?? [],
  };
}

function groupWallets(
  rows: WalletRow[] | null,
  movements: MovementRow[] | null
): Record<string, WalletRecord> {
  const byLeader: Record<string, WalletMovement[]> = {};
  for (const row of movements ?? []) {
    const movement: WalletMovement = {
      id: row.id,
      kind: row.kind,
      amount: Number(row.amount),
      status: "recorded",
      createdAt: row.created_at,
    };
    if (row.source) movement.source = row.source;
    (byLeader[row.leader_id] ??= []).push(movement);
  }
  const wallets: Record<string, WalletRecord> = {};
  for (const row of rows ?? []) {
    const record: WalletRecord = {
      leaderId: row.leader_id,
      sources: {
        crowdfunding: Number(row.crowdfunding),
        merchandise: Number(row.merchandise),
        donations: Number(row.donations),
        transfers: Number(row.transfers),
      },
      movements: byLeader[row.leader_id] ?? [],
    };
    if (row.last_top_up_at) record.lastTopUpAt = row.last_top_up_at;
    if (row.last_withdrawal_at) record.lastWithdrawalAt = row.last_withdrawal_at;
    wallets[row.leader_id] = record;
  }
  return wallets;
}

function groupSaved(rows: SavedRow[] | null): Record<string, string[]> {
  const grouped: Record<string, SavedRow[]> = {};
  for (const row of rows ?? []) (grouped[row.user_id] ??= []).push(row);
  const saved: Record<string, string[]> = {};
  for (const [userId, items] of Object.entries(grouped)) {
    items.sort((a, b) => a.position - b.position);
    saved[userId] = items.map((item) => item.opportunity_id);
  }
  return saved;
}

function remember(cache: Cache): Cache {
  globalStore.__mtajiSupabase = cache;
  return cache;
}

const cacheReads: SupabaseCall[] = [
  { kind: "rpc", fn: "list_users" },
  { kind: "rpc", fn: "content_snapshot" },
  { kind: "rpc", fn: "adly_snapshot" },
  { kind: "rpc", fn: "list_adly_interests" },
  { kind: "rest", method: "GET", path: "/rest/v1/wallets?select=*" },
  { kind: "rest", method: "GET", path: "/rest/v1/wallet_movements?select=*&order=seq.desc" },
  {
    kind: "rest",
    method: "GET",
    path: "/rest/v1/saved_opportunities?select=user_id,opportunity_id,position&order=position.asc",
  },
];

function pack(
  users: PublicUser[] | null,
  content: PlatformContent | null,
  adly: AdlyContent | null,
  leads: AdlyInterestLead[] | null,
  walletRows: WalletRow[] | null,
  movementRows: MovementRow[] | null,
  savedRows: SavedRow[] | null
): Cache {
  return remember({
    ready: true,
    users: users ?? [],
    content: asContent(content),
    adly: asAdly(adly),
    leads: leads ?? [],
    wallets: groupWallets(walletRows, movementRows),
    saved: groupSaved(savedRows),
  });
}

export async function loadSupabaseCache(): Promise<void> {
  const [users, content, adly, leads, walletRows, movementRows, savedRows] = await Promise.all([
    rpc<PublicUser[]>("list_users"),
    rpc<PlatformContent>("content_snapshot"),
    rpc<AdlyContent>("adly_snapshot"),
    rpc<AdlyInterestLead[]>("list_adly_interests"),
    supabaseCall<WalletRow[]>({ kind: "rest", method: "GET", path: "/rest/v1/wallets?select=*" }),
    supabaseCall<MovementRow[]>({
      kind: "rest",
      method: "GET",
      path: "/rest/v1/wallet_movements?select=*&order=seq.desc",
    }),
    supabaseCall<SavedRow[]>({
      kind: "rest",
      method: "GET",
      path: "/rest/v1/saved_opportunities?select=user_id,opportunity_id,position&order=position.asc",
    }),
  ]);
  pack(users, content, adly, leads, walletRows, movementRows, savedRows);
}

function readCacheSync(): Cache {
  const [users, content, adly, leads, walletRows, movementRows, savedRows] = supabaseBatchSync<
    | PublicUser[]
    | PlatformContent
    | AdlyContent
    | AdlyInterestLead[]
    | WalletRow[]
    | MovementRow[]
    | SavedRow[]
  >(cacheReads);
  return pack(
    users as PublicUser[],
    content as PlatformContent,
    adly as AdlyContent,
    leads as AdlyInterestLead[],
    walletRows as WalletRow[],
    movementRows as MovementRow[],
    savedRows as SavedRow[]
  );
}

function cache(): Cache {
  return globalStore.__mtajiSupabase ?? readCacheSync();
}

function reloadContent(): void {
  cache().content = asContent(rpcSync<PlatformContent>("content_snapshot"));
}

function reloadAdly(): void {
  cache().adly = asAdly(rpcSync<AdlyContent>("adly_snapshot"));
}

function byId<T extends { id: string }>(list: T[], id: string): T | undefined {
  const found = list.find((item) => item.id === id);
  return found ? copy(found) : undefined;
}

function bySlug<T extends { slug: string }>(list: T[], slug: string): T | undefined {
  const found = list.find((item) => item.slug === slug);
  return found ? copy(found) : undefined;
}

function missingIds(current: { id: string }[], next: { id: string }[]): string[] {
  const keep = new Set(next.map((item) => item.id));
  return current.filter((item) => !keep.has(item.id)).map((item) => item.id);
}

function deleteCalls(fn: string, ids: string[]): SupabaseCall[] {
  return ids.map((id) => ({ kind: "rpc", fn, args: { p_id: id } }));
}

function run(calls: SupabaseCall[]): void {
  if (calls.length === 0) return;
  try {
    supabaseBatchSync(calls);
  } catch (error) {
    fail(error);
  }
}

function saveWallet(record: WalletRecord): WalletRecord {
  try {
    supabaseCallSync({
      kind: "rest",
      method: "POST",
      path: "/rest/v1/wallets",
      prefer: "resolution=merge-duplicates",
      body: {
        leader_id: record.leaderId,
        crowdfunding: record.sources.crowdfunding,
        merchandise: record.sources.merchandise,
        donations: record.sources.donations,
        transfers: record.sources.transfers,
        last_top_up_at: record.lastTopUpAt ?? null,
        last_withdrawal_at: record.lastWithdrawalAt ?? null,
      },
    });
    supabaseCallSync({
      kind: "rest",
      method: "DELETE",
      path: `/rest/v1/wallet_movements?leader_id=eq.${encodeURIComponent(record.leaderId)}`,
    });
    if (record.movements.length > 0) {
      supabaseCallSync({
        kind: "rest",
        method: "POST",
        path: "/rest/v1/wallet_movements",
        body: [...record.movements].reverse().map((movement) => ({
          id: movement.id,
          leader_id: record.leaderId,
          kind: movement.kind,
          amount: movement.amount,
          source: movement.source ?? null,
          status: "recorded",
          created_at: movement.createdAt,
        })),
      });
    }
  } catch (error) {
    fail(error);
  }
  const saved = copy(record);
  cache().wallets[record.leaderId] = saved;
  return copy(saved);
}

let repositories: AppRepositories | undefined;

export function getSupabaseRepositories(): AppRepositories {
  if (repositories) return repositories;
  repositories = createRepositories();
  return repositories;
}

function createRepositories(): AppRepositories {
  const users: AppRepositories["users"] = {
    count: () => cache().users.length,
    listPublic: () => copy(cache().users),
    findById: (id) => byId(cache().users, id),
    findByEmail: (email) => {
      const normalized = email.trim().toLowerCase();
      const found = cache().users.find((account) => account.email.toLowerCase() === normalized);
      return found ? copy(found) : undefined;
    },
    verifyPassword: (email, password) => {
      let hash: string | null = null;
      try {
        hash = rpcSync<string | null>("user_password_hash", { p_email: email });
      } catch (error) {
        fail(error);
      }
      const matches = verifyPasswordHash(password, hash || dummyPasswordHash());
      return Boolean(hash) && matches;
    },
    create: (input) => {
      const email = input.email.trim().toLowerCase();
      if (cache().users.some((account) => account.email.toLowerCase() === email)) {
        throw new Error("An account with this email already exists.");
      }
      try {
        const saved = rpcSync<PublicUser>("upsert_user", {
          doc: {
            id: input.id || createId("usr"),
            fullName: input.fullName.trim(),
            email,
            phone: input.phone.trim(),
            role: input.role,
            createdAt: input.createdAt || new Date().toISOString(),
            leaderId: input.leaderId,
          },
          p_password_hash: hashPassword(input.password),
        });
        cache().users = [...cache().users, saved];
        return copy(saved);
      } catch (error) {
        fail(error);
      }
    },
    update: (user) => {
      if (!cache().users.some((account) => account.id === user.id)) return undefined;
      const email = user.email.trim().toLowerCase();
      if (
        cache().users.some((account) => account.email.toLowerCase() === email && account.id !== user.id)
      ) {
        throw new Error("An account with this email already exists.");
      }
      try {
        const saved = rpcSync<PublicUser>("upsert_user", {
          doc: { ...user, email },
          p_password_hash: null,
        });
        cache().users = cache().users.map((account) => (account.id === saved.id ? saved : account));
        return copy(saved);
      } catch (error) {
        fail(error);
      }
    },
    setPassword: (id, password) => {
      if (!cache().users.some((account) => account.id === id)) return false;
      try {
        return rpcSync<boolean>("set_user_password", {
          p_id: id,
          p_password_hash: hashPassword(password),
        });
      } catch (error) {
        fail(error);
      }
    },
    delete: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_user", { p_id: id });
        if (removed) {
          cache().users = cache().users.filter((account) => account.id !== id);
          delete cache().saved[id];
        }
        return removed;
      } catch (error) {
        fail(error);
      }
    },
  };

  function writeContent(itemCall: SupabaseCall): void {
    try {
      supabaseCallSync(itemCall);
      reloadContent();
    } catch (error) {
      fail(error);
    }
  }

  const content: AppRepositories["content"] = {
    snapshot: () => copy(cache().content),
    reset: () => {
      const seed = seedContentShape();
      const current = cache().content;
      run([
        ...deleteCalls("delete_product", missingIds(current.products, seed.products)),
        ...deleteCalls("delete_opportunity", missingIds(current.opportunities, seed.opportunities)),
        ...deleteCalls("delete_media", missingIds(current.media, seed.media)),
        ...deleteCalls("delete_poll", missingIds(current.polls, seed.polls)),
        ...deleteCalls("delete_milestone", missingIds(current.milestones, seed.milestones)),
        ...deleteCalls("delete_project", missingIds(current.projects, seed.projects)),
        ...deleteCalls("delete_leader", missingIds(current.leaders, seed.leaders)),
        ...contentSeedCalls(seed).map((step) => step.call),
      ]);
      reloadContent();
    },
    listLeaders: () => copy(cache().content.leaders),
    findLeader: (id) => byId(cache().content.leaders, id),
    findLeaderBySlug: (slug) => bySlug(cache().content.leaders, slug),
    upsertLeader: (item) => {
      writeContent({ kind: "rpc", fn: "upsert_leader", args: { doc: item } });
      return byId(cache().content.leaders, item.id) as Leader;
    },
    deleteLeader: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_leader", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listProjects: () => copy(cache().content.projects),
    findProject: (id) => byId(cache().content.projects, id),
    findProjectBySlug: (slug) => bySlug(cache().content.projects, slug),
    listProjectsByIds: (ids) => copy(cache().content.projects.filter((item) => ids.includes(item.id))),
    upsertProject: (item) => {
      writeContent({ kind: "rpc", fn: "upsert_project", args: { doc: item } });
      return byId(cache().content.projects, item.id) as Project;
    },
    deleteProject: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_project", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listMilestones: () => copy(cache().content.milestones),
    findMilestone: (id) => byId(cache().content.milestones, id),
    listMilestonesByProject: (projectId) =>
      copy(
        cache()
          .content.milestones.filter((item) => item.projectId === projectId)
          .sort((a, b) => a.number - b.number)
      ),
    upsertMilestone: (item) => {
      writeContent({ kind: "rpc", fn: "upsert_milestone", args: { doc: item } });
      return byId(cache().content.milestones, item.id) as ProjectMilestone;
    },
    deleteMilestone: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_milestone", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listOpportunities: () => copy(cache().content.opportunities),
    findOpportunity: (id) => byId(cache().content.opportunities, id),
    findOpportunityBySlug: (slug) => bySlug(cache().content.opportunities, slug),
    listOpportunitiesByIds: (ids) =>
      copy(cache().content.opportunities.filter((item) => ids.includes(item.id))),
    upsertOpportunity: (item) => {
      writeContent({ kind: "rpc", fn: "upsert_opportunity", args: { doc: item } });
      return byId(cache().content.opportunities, item.id) as Opportunity;
    },
    deleteOpportunity: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_opportunity", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listMedia: () => copy(cache().content.media),
    findMedia: (id) => byId(cache().content.media, id),
    findMediaBySlug: (slug) => bySlug(cache().content.media, slug),
    listMediaByIds: (ids) => copy(cache().content.media.filter((item) => ids.includes(item.id))),
    upsertMedia: (item) => {
      writeContent({ kind: "rpc", fn: "upsert_media", args: { doc: item } });
      return byId(cache().content.media, item.id) as MediaItem;
    },
    deleteMedia: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_media", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listPolls: () => copy(cache().content.polls),
    findPoll: (id) => byId(cache().content.polls, id),
    findPollBySlug: (slug) => bySlug(cache().content.polls, slug),
    listPollsByIds: (ids) => copy(cache().content.polls.filter((item) => ids.includes(item.id))),
    upsertPoll: (item) => {
      const scoped = scopePoll(item);
      writeContent({ kind: "rpc", fn: "upsert_poll", args: { doc: scoped } });
      return byId(cache().content.polls, scoped.id) as Poll;
    },
    deletePoll: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_poll", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listProducts: () => copy(cache().content.products),
    findProduct: (id) => byId(cache().content.products, id),
    findProductBySlug: (slug) => bySlug(cache().content.products, slug),
    listProductsByLeader: (leaderId) =>
      copy(cache().content.products.filter((item) => item.leaderId === leaderId)),
    upsertProduct: (item) => {
      writeContent({ kind: "rpc", fn: "upsert_product", args: { doc: item } });
      return byId(cache().content.products, item.id) as Product;
    },
    deleteProduct: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_product", { p_id: id });
        if (removed) reloadContent();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
  };

  function writeAdly(
    itemCall: SupabaseCall,
    id: string,
    pick: (adly: AdlyContent) => { id: string }[]
  ): { id: string } {
    try {
      supabaseCallSync(itemCall);
      reloadAdly();
    } catch (error) {
      fail(error);
    }
    return copy(pick(cache().adly).find((item) => item.id === id) as { id: string });
  }

  const docCall = (fn: string, item: unknown): SupabaseCall => ({
    kind: "rpc",
    fn,
    args: { doc: item },
  });

  const withoutMilestones = (item: Timelapse): Timelapse => {
    const copy = { ...item };
    delete (copy as { milestones?: string[] }).milestones;
    return copy;
  };

  const adly: AppRepositories["adly"] = {
    snapshot: () => copy(cache().adly),
    replace: (next) => {
      const current = cache().adly;
      run([
        ...deleteCalls("delete_campaign", missingIds(current.campaigns, next.campaigns)),
        ...deleteCalls("delete_policy_review", missingIds(current.policyReviews, next.policyReviews)),
        ...deleteCalls("delete_creative", missingIds(current.creatives, next.creatives)),
        ...deleteCalls("delete_poster", missingIds(current.posters, next.posters)),
        ...deleteCalls("delete_timelapse", missingIds(current.timelapses, next.timelapses)),
        ...deleteCalls("delete_simulation", missingIds(current.simulations, next.simulations)),
        ...deleteCalls("delete_insight", missingIds(current.insights, next.insights)),
        ...next.creatives.map((item) => docCall("upsert_creative", item)),
        ...next.campaigns.map((item) => docCall("upsert_campaign", item)),
        ...next.policyReviews.map((item) => docCall("upsert_policy_review", item)),
        ...next.posters.map((item) => docCall("upsert_poster", item)),
        ...next.timelapses.map((item) => docCall("upsert_timelapse", withoutMilestones(item))),
        ...next.simulations.map((item) => docCall("upsert_simulation", item)),
        ...next.insights.map((item) => docCall("upsert_insight", item)),
      ]);
      reloadAdly();
    },
    reset: () => {
      adly.replace(seedAdlyShape());
    },
    listCampaigns: () => copy(cache().adly.campaigns),
    findCampaign: (id) => byId(cache().adly.campaigns, id),
    upsertCampaign: (item) =>
      writeAdly(docCall("upsert_campaign", item), item.id, (store) => store.campaigns) as Campaign,
    deleteCampaign: (id) => {
      try {
        const removed = rpcSync<boolean>("delete_campaign", { p_id: id });
        if (removed) reloadAdly();
        return removed;
      } catch (error) {
        fail(error);
      }
    },
    listCreatives: () => copy(cache().adly.creatives),
    findCreative: (id) => byId(cache().adly.creatives, id),
    upsertCreative: (item) =>
      writeAdly(docCall("upsert_creative", item), item.id, (store) => store.creatives) as AdCreative,
    listPolicyReviews: () => copy(cache().adly.policyReviews),
    findPolicyReview: (id) => byId(cache().adly.policyReviews, id),
    upsertPolicyReview: (item) =>
      writeAdly(docCall("upsert_policy_review", item), item.id, (store) => store.policyReviews) as PolicyReview,
    listPosters: () => copy(cache().adly.posters),
    findPoster: (id) => byId(cache().adly.posters, id),
    upsertPoster: (item) => writeAdly(docCall("upsert_poster", item), item.id, (store) => store.posters) as Poster,
    listTimelapses: () => copy(cache().adly.timelapses),
    findTimelapse: (id) => byId(cache().adly.timelapses, id),
    upsertTimelapse: (item) =>
      writeAdly(
        docCall("upsert_timelapse", withoutMilestones(item)),
        item.id,
        (store) => store.timelapses
      ) as Timelapse,
    listSimulations: () => copy(cache().adly.simulations),
    findSimulation: (id) => byId(cache().adly.simulations, id),
    upsertSimulation: (item) =>
      writeAdly(docCall("upsert_simulation", item), item.id, (store) => store.simulations) as Simulation,
    listInsights: () => copy(cache().adly.insights),
    addInsight: (item) => {
      writeAdly(docCall("upsert_insight", item), item.id, (store) => store.insights);
      return byId(cache().adly.insights, item.id) as AdlyInsight;
    },
  };

  const wallets: AppRepositories["wallets"] = {
    listLeaderIds: () => Object.keys(cache().wallets),
    get: (leaderId) => {
      const saved = cache().wallets[leaderId];
      return saved ? copy(saved) : defaultWallet(leaderId);
    },
    save: (record) => saveWallet(record),
  };

  const engagement: AppRepositories["engagement"] = {
    getSavedOpportunityIds: (userId) => copy(cache().saved[userId] ?? []),
    setSavedOpportunityIds: (userId, ids) => {
      try {
        const saved = rpcSync<string[]>("set_saved_opportunities", {
          p_user_id: userId,
          p_ids: ids,
        });
        cache().saved[userId] = saved ?? [];
        return copy(cache().saved[userId]);
      } catch (error) {
        fail(error);
      }
    },
    listAdlyInterests: () => copy(cache().leads),
    addAdlyInterest: (input) => {
      try {
        const lead = rpcSync<AdlyInterestLead>("add_adly_interest", { doc: input });
        cache().leads = [lead, ...cache().leads.filter((item) => item.id !== lead.id)];
        return copy(lead);
      } catch (error) {
        fail(error);
      }
    },
  };

  return {
    users,
    content,
    adly,
    wallets,
    engagement,
    counts: (): SeedCounts => ({
      users: cache().users.length,
      leaders: cache().content.leaders.length,
      projects: cache().content.projects.length,
      milestones: cache().content.milestones.length,
      opportunities: cache().content.opportunities.length,
      media: cache().content.media.length,
      polls: cache().content.polls.length,
      products: cache().content.products.length,
      campaigns: cache().adly.campaigns.length,
      creatives: cache().adly.creatives.length,
      policyReviews: cache().adly.policyReviews.length,
      posters: cache().adly.posters.length,
      timelapses: cache().adly.timelapses.length,
      simulations: cache().adly.simulations.length,
      insights: cache().adly.insights.length,
      wallets: Object.keys(cache().wallets).length,
      savedOpportunityLists: Object.keys(cache().saved).length,
      adlyInterests: cache().leads.length,
    }),
    resetAll: () => {
      const keep = new Set(createSeedUserIds());
      run([
        { kind: "rpc", fn: "clear_runtime_data" },
        ...deleteCalls(
          "delete_user",
          cache()
            .users.filter((account) => !keep.has(account.id))
            .map((account) => account.id)
        ),
        ...contentSeedCalls().map((step) => step.call),
        ...userSeedCalls().map((step) => step.call),
        ...adlySeedCalls().map((step) => step.call),
      ]);
      readCacheSync();
    },
  };
}

function createSeedUserIds(): string[] {
  return userSeedCalls().flatMap((step) => {
    if (step.call.kind !== "rpc" || !step.call.args) return [];
    const doc = step.call.args.doc;
    if (!doc || typeof doc !== "object" || !("id" in doc)) return [];
    const id = (doc as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
}
