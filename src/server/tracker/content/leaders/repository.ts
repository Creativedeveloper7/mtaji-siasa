import type { SupabaseClient } from "@supabase/supabase-js";
import type { Leader } from "@/types";
import type { ContentRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { anonClient, serviceClient, userClient } from "@/server/tracker/clients";
import { assignSlugs, findBySlug, isUuid, rowSlug } from "@/server/tracker/slug";
import {
  NO_LINKS,
  isNoopWrite,
  isPubliclyListed,
  leaderToRow,
  rowToLeader,
  type FigureRow,
  type FigureWrite,
  type LeaderLinks,
} from "@/server/tracker/content/leaders/mapping";

/**
 * Leaders on the Tracker's political_figures table (docs/content-mapping.md §3).
 *
 * Clients:
 * - anon: public lists and lookups (RLS shows status = 'active'; M3 adds
 *   aspirant / seeking_reelection).
 * - user: a signed-in person reading and writing their own row
 *   ("Users can manage their own political figure profile", auth.uid() = user_id).
 * - service: only for an admin acting on a row that is not theirs, or creating
 *   a leader who has no account. Each call site says why.
 */

const TABLE = "political_figures";

/** Who is acting. Verified by the caller (auth.getUser()), never read from a request body. */
export interface LeaderActor {
  userId: string;
  isAdmin: boolean;
}

export interface LeaderClients {
  anon: () => SupabaseClient;
  user: () => Promise<SupabaseClient>;
  service: () => SupabaseClient;
}

/** What another slice needs to work out one figure's links. */
export interface LeaderLinkTarget {
  /** political_figures.id */
  id: string;
  /** political_figures.user_id: owner of initiatives (via changemakers), opportunities, blogs, polls, products. Null for seeded leaders. */
  userId: string | null;
  /** political_figures.commissioned_projects (initiative ids). */
  commissionedProjects: string[];
}

/**
 * Links provider. Called once per read with every figure being returned, so it
 * can batch. Return an entry per figure id (missing ids and missing keys
 * become empty arrays). Results must already be filtered to what a public
 * reader may see (published/active only).
 */
export type LeaderLinksProvider = (
  figures: LeaderLinkTarget[]
) => Promise<Map<string, Partial<LeaderLinks>>>;

export interface LeaderStoreOptions {
  links?: LeaderLinksProvider;
  clients?: Partial<LeaderClients>;
  /**
   * False until §17 M3 and M5 are applied: writes then leave out the new
   * columns (honorific, office_title, photo, bio, vision…). Default true.
   */
  newColumns?: boolean;
  now?: () => Date;
}

export class LeaderStoreError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 500,
    message: string
  ) {
    super(message);
    this.name = "LeaderStoreError";
  }
}

/** Explicit-actor API. The service layer uses this when it already holds the session. */
export interface LeaderStore {
  list(): Promise<Leader[]>;
  /** Public row by id; with an actor, also their own hidden row (or any row for an admin). */
  find(id: string, actor?: LeaderActor | null | (() => Promise<LeaderActor | null>)): Promise<Leader | undefined>;
  findBySlug(slugOrId: string): Promise<Leader | undefined>;
  /** Create or update. Throws LeaderStoreError (400 / 403 / 409 / 500). */
  save(actor: LeaderActor, leader: Leader): Promise<Leader>;
  /** Hard delete. A non-admin can delete only their own row. */
  remove(actor: LeaderActor, id: string): Promise<boolean>;
}

type QueryResult<T> = { data: T | null; error: { message: string; code?: string } | null };

function check<T>(result: QueryResult<T>, action: string): T | null {
  if (result.error) {
    throw new LeaderStoreError(500, `Could not ${action}: ${result.error.message}`);
  }
  return result.data;
}

export function createLeaderStore(options: LeaderStoreOptions = {}): LeaderStore {
  const clients: LeaderClients = {
    anon: options.clients?.anon ?? anonClient,
    user: options.clients?.user ?? userClient,
    service: options.clients?.service ?? serviceClient,
  };
  const now = options.now ?? (() => new Date());
  const newColumns = options.newColumns ?? true;

  async function publicRows(): Promise<FigureRow[]> {
    const result = (await clients
      .anon()
      .from(TABLE)
      .select("*")
      .neq("status", "former")
      .order("name", { ascending: true })
      .order("created_at", { ascending: true })) as QueryResult<FigureRow[]>;
    return (check(result, "load leaders") ?? []).filter((row) => isPubliclyListed(row.status));
  }

  async function rowById(client: SupabaseClient, id: string): Promise<FigureRow | null> {
    const result = (await client.from(TABLE).select("*").eq("id", id).maybeSingle()) as QueryResult<FigureRow>;
    return check(result, "load the leader");
  }

  /** profiles.bio for figures that have a user but no bio of their own. profiles is publicly readable. */
  async function profileBios(rows: FigureRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.filter((row) => row.user_id && !row.bio?.trim()).map((row) => row.user_id!))];
    if (!ids.length) return new Map();
    const result = (await clients.anon().from("profiles").select("id, bio").in("id", ids)) as QueryResult<
      Array<{ id: string; bio: string | null }>
    >;
    // A missing bio is not worth failing the page for.
    if (result.error) return new Map();
    return new Map((result.data ?? []).filter((p) => p.bio).map((p) => [p.id, p.bio as string]));
  }

  async function linksFor(rows: FigureRow[]): Promise<Map<string, Partial<LeaderLinks>>> {
    if (!options.links || !rows.length) return new Map();
    return options.links(
      rows.map((row) => ({
        id: row.id,
        userId: row.user_id ?? null,
        commissionedProjects: row.commissioned_projects ?? [],
      }))
    );
  }

  /** Maps `rows`; slugs are assigned over the public rows plus these, so collisions match the list. */
  async function toLeaders(rows: FigureRow[], universe: FigureRow[]): Promise<Leader[]> {
    const all = [...universe, ...rows.filter((row) => !universe.some((other) => other.id === row.id))];
    const slugs = assignSlugs(all, (row) => row.name);
    const [links, bios] = await Promise.all([linksFor(rows), profileBios(rows)]);
    return rows.map((row) => {
      const found = links.get(row.id) ?? {};
      return rowToLeader(row, {
        slug: slugs.get(row.id),
        profileBio: row.user_id ? bios.get(row.user_id) : undefined,
        links: {
          projectIds: found.projectIds ?? NO_LINKS.projectIds,
          opportunityIds: found.opportunityIds ?? NO_LINKS.opportunityIds,
          mediaIds: found.mediaIds ?? NO_LINKS.mediaIds,
          pollIds: found.pollIds ?? NO_LINKS.pollIds,
          productIds: found.productIds ?? NO_LINKS.productIds,
        },
      });
    });
  }

  async function one(row: FigureRow): Promise<Leader> {
    const [leader] = await toLeaders([row], await publicRows());
    return leader;
  }

  /**
   * The row a write acts on. An admin reads it with the service client: the
   * row may be an aspirant or former figure that no RLS read policy shows,
   * and admin is app_metadata.role, which RLS does not check.
   */
  async function rowForWrite(actor: LeaderActor, id: string): Promise<FigureRow | null> {
    if (!isUuid(id)) return null;
    const client = actor.isAdmin ? clients.service() : await clients.user();
    return rowById(client, id);
  }

  function write(leader: Leader, existing: FigureRow | null): FigureWrite {
    const result = leaderToRow(leader, existing, { now: now(), newColumns });
    if (!result.ok) throw new LeaderStoreError(400, result.error);
    return result.row;
  }

  return {
    async list() {
      const rows = await publicRows();
      return toLeaders(rows, rows);
    },

    async find(id, actor) {
      if (!isUuid(id)) return undefined;
      const rows = await publicRows();
      const listed = rows.find((row) => row.id === id);
      if (listed) return (await toLeaders([listed], rows))[0];
      const who = typeof actor === "function" ? await actor() : actor;
      if (!who) return undefined;
      // Own hidden row through RLS; an admin sees any row (service, see rowForWrite).
      const hidden = await rowForWrite(who, id);
      if (!hidden || (!who.isAdmin && hidden.user_id !== who.userId)) return undefined;
      return (await toLeaders([hidden], rows))[0];
    },

    async findBySlug(slugOrId) {
      const input = slugOrId.trim().toLowerCase();
      if (!input) return undefined;
      const rows = await publicRows();
      const slugs = assignSlugs(rows, (row) => row.name);
      const row = findBySlug(rows, slugs, input) ?? slugFallback(rows, input);
      return row ? (await toLeaders([row], rows))[0] : undefined;
    },

    async save(actor, leader) {
      const existing = await rowForWrite(actor, leader.id);

      if (existing) {
        const owner = existing.user_id !== null && existing.user_id === actor.userId;
        const patch = write(leader, existing);
        // Link arrays and slug are derived, so a save that changes only them
        // writes nothing (this keeps the service's relinkLeaders() harmless).
        if (isNoopWrite(patch, existing)) return one(existing);
        if (!owner && !actor.isAdmin) {
          throw new LeaderStoreError(403, "You can only edit your own leader profile.");
        }
        // Owner: user client under RLS. Admin editing another account's row or a
        // leader with no account: service, because no RLS rule lets an admin write it.
        const client = owner ? await clients.user() : clients.service();
        const result = (await client
          .from(TABLE)
          .update(patch)
          .eq("id", existing.id)
          .select("*")
          .single()) as QueryResult<FigureRow>;
        const saved = check(result, "save the leader");
        if (!saved) throw new LeaderStoreError(500, "Could not save the leader.");
        return one(saved);
      }

      const insert: FigureWrite = write(leader, null);
      if (isUuid(leader.id)) insert.id = leader.id;

      let client: SupabaseClient;
      if (actor.isAdmin) {
        // Admin creating a leader who has no account (user_id null). No RLS rule
        // allows it once the "(testing)" insert policy is dropped (§17 M9).
        client = clients.service();
        insert.user_id = null;
      } else {
        client = await clients.user();
        const mine = (await client
          .from(TABLE)
          .select("id")
          .eq("user_id", actor.userId)
          .maybeSingle()) as QueryResult<{ id: string }>;
        if (check(mine, "check your leader profile")) {
          throw new LeaderStoreError(409, "You already have a leader profile.");
        }
        insert.user_id = actor.userId;
      }
      const result = (await client.from(TABLE).insert(insert).select("*").single()) as QueryResult<FigureRow>;
      if (result.error?.code === "23505") {
        throw new LeaderStoreError(409, "That leader profile already exists.");
      }
      const saved = check(result, "create the leader");
      if (!saved) throw new LeaderStoreError(500, "Could not create the leader.");
      return one(saved);
    },

    async remove(actor, id) {
      if (!isUuid(id)) return false;
      if (actor.isAdmin) {
        // Admin deleting any leader, including ones without an account: no RLS
        // rule grants an admin delete on another user's row.
        const result = (await clients
          .service()
          .from(TABLE)
          .delete()
          .eq("id", id)
          .select("id")) as QueryResult<Array<{ id: string }>>;
        return (check(result, "delete the leader") ?? []).length > 0;
      }
      const result = (await (await clients.user())
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("user_id", actor.userId)
        .select("id")) as QueryResult<Array<{ id: string }>>;
      return (check(result, "delete the leader") ?? []).length > 0;
    },
  };
}

/**
 * Slug lookups that the collision-aware map misses (§2):
 * - `base-1a2b3c4d` after the collision went away: base slug + id prefix.
 * - the bare base slug of a collided name, as the Tracker links it (/p/base):
 *   the first row in list order (name, then oldest).
 */
export function slugFallback(rows: FigureRow[], slug: string): FigureRow | undefined {
  const suffixed = /^(.*)-([0-9a-f]{8})$/.exec(slug);
  if (suffixed) {
    const [, base, prefix] = suffixed;
    const hit = rows.find((row) => row.id.toLowerCase().startsWith(prefix) && rowSlug(row.name, row.id) === base);
    if (hit) return hit;
  }
  return rows.find((row) => rowSlug(row.name, row.id) === slug);
}

export interface LeaderRepositoryOptions extends LeaderStoreOptions {
  /**
   * The verified caller, for writes and own-row reads. Defaults to
   * auth.getUser() on the user client, with admin from app_metadata.role.
   * Not currentSession(): that reads leaders itself and would recurse.
   */
  actor?: () => Promise<LeaderActor | null>;
}

export type LeaderRepository = Pick<
  Promisified<ContentRepository>,
  "listLeaders" | "findLeader" | "findLeaderBySlug" | "upsertLeader" | "deleteLeader"
>;

/** ContentRepository's leader methods. Writes need a signed-in caller; see LeaderStore for the explicit-actor API. */
export function createLeaderRepository(options: LeaderRepositoryOptions = {}): LeaderRepository {
  const store = createLeaderStore(options);
  const user = options.clients?.user ?? userClient;
  const actorOf =
    options.actor ??
    (async (): Promise<LeaderActor | null> => {
      const { data, error } = await (await user()).auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id, isAdmin: data.user.app_metadata?.role === "admin" };
    });

  async function requireActor(): Promise<LeaderActor> {
    const actor = await actorOf();
    if (!actor) throw new LeaderStoreError(401, "Sign in to change leader profiles.");
    return actor;
  }

  return {
    listLeaders: () => store.list(),
    // The actor is only resolved when the id is not a public row.
    findLeader: (id) => store.find(id, actorOf),
    findLeaderBySlug: (slug) => store.findBySlug(slug),
    upsertLeader: async (item) => store.save(await requireActor(), item),
    deleteLeader: async (id) => store.remove(await requireActor(), id),
  };
}
