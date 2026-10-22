import type { SupabaseClient } from "@supabase/supabase-js";
import type { Opportunity } from "@/types";
import type { ContentRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { assignSlugs, findBySlug, isUuid } from "@/server/tracker/slug";
import {
  opportunityFromRow,
  opportunityToRow,
  type InitiativeLink,
  type OpportunityRow,
} from "./mapping";
import {
  check,
  currentUserId,
  defaultClients,
  TrackerWriteError,
  writeWithExtra,
  type OpportunityClients,
} from "./support";

export type OpportunityRepository = Pick<
  Promisified<ContentRepository>,
  | "listOpportunities"
  | "findOpportunity"
  | "findOpportunityBySlug"
  | "listOpportunitiesByIds"
  | "upsertOpportunity"
  | "deleteOpportunity"
>;

/**
 * Every row the reader may see, newest first. `select("*")` so the M1/M5b
 * columns are picked up once they exist without breaking before.
 * The table has 3 rows today; route slugs need the whole set anyway
 * (collision suffixes), which is what the Tracker does as well.
 */
async function loadRows(client: SupabaseClient): Promise<OpportunityRow[]> {
  const { data, error } = await client
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false });
  check(error, "Could not load opportunities");
  return (data ?? []) as OpportunityRow[];
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Linked initiatives (county and image fallbacks). RLS shows public ones. */
async function loadInitiatives(client: SupabaseClient, ids: string[]): Promise<Map<string, InitiativeLink>> {
  if (!ids.length) return new Map();
  const { data, error } = await client.from("initiatives").select("id, location, reference_images").in("id", ids);
  check(error, "Could not load linked projects");
  return new Map(((data ?? []) as InitiativeLink[]).map((row) => [row.id, row]));
}

/**
 * political_figures.id per author user id. Newest row wins, as in roles.ts.
 * Anon RLS only shows `status = 'active'` figures until M3, so an aspirant
 * author has no leaderId on public reads yet.
 */
export async function leaderIdsByUser(client: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const { data, error } = await client
    .from("political_figures")
    .select("id, user_id, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: true });
  check(error, "Could not load leaders");
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; user_id: string }>) map.set(row.user_id, row.id);
  return map;
}

/** Published blogs per initiative (Opportunity.relatedMediaIds). */
async function loadRelatedMedia(client: SupabaseClient, initiativeIds: string[]): Promise<Map<string, string[]>> {
  if (!initiativeIds.length) return new Map();
  const { data, error } = await client
    .from("blogs")
    .select("id, initiative_id")
    .in("initiative_id", initiativeIds)
    .eq("status", "published");
  check(error, "Could not load related stories");
  const map = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ id: string; initiative_id: string }>) {
    map.set(row.initiative_id, [...(map.get(row.initiative_id) ?? []), row.id]);
  }
  return map;
}

/** Maps rows to Siasa opportunities. `all` decides the slugs, `rows` what is returned. */
export async function hydrateOpportunities(
  client: SupabaseClient,
  all: OpportunityRow[],
  rows: OpportunityRow[] = all,
  now: Date = new Date()
): Promise<Opportunity[]> {
  if (!rows.length) return [];
  const slugs = assignSlugs(all, (row) => row.title);
  const initiativeIds = unique(rows.map((row) => row.initiative_id));
  const [initiatives, leaders, media] = await Promise.all([
    loadInitiatives(client, initiativeIds),
    leaderIdsByUser(client, unique(rows.map((row) => row.author_id))),
    loadRelatedMedia(client, initiativeIds),
  ]);
  return rows.map((row) =>
    opportunityFromRow(row, {
      slug: slugs.get(row.id) ?? row.id.slice(0, 8),
      initiative: row.initiative_id ? initiatives.get(row.initiative_id) : undefined,
      leaderId: row.author_id ? leaders.get(row.author_id) : undefined,
      relatedMediaIds: row.initiative_id ? media.get(row.initiative_id) : undefined,
      now,
    })
  );
}

/**
 * Opportunity ids per author user id, for the leaders slice
 * (Leader.opportunityIds).
 *
 * Contract:
 * - Input: auth user ids (`political_figures.user_id`), not political_figures ids.
 *   Non-uuid ids are ignored.
 * - Output: a Map with an entry for every input id (empty array when the user
 *   authored nothing visible), ids newest first.
 * - Visibility follows the reader client: published rows, plus the signed-in
 *   author's own closed rows.
 */
export async function opportunityIdsByAuthor(
  userIds: string[],
  clients: OpportunityClients = defaultClients()
): Promise<Map<string, string[]>> {
  const ids = unique(userIds).filter(isUuid);
  const map = new Map<string, string[]>(unique(userIds).map((id) => [id, []]));
  if (!ids.length) return map;
  const client = await clients.reader();
  const { data, error } = await client
    .from("opportunities")
    .select("id, author_id, created_at")
    .in("author_id", ids)
    .order("created_at", { ascending: false });
  check(error, "Could not load opportunities");
  for (const row of (data ?? []) as Array<{ id: string; author_id: string }>) {
    map.get(row.author_id)?.push(row.id);
  }
  return map;
}

/**
 * Opportunities on the Tracker `opportunities` table.
 *
 * Reads: session client (anon when there is no request), so RLS shows
 * published listings plus the author's own closed ones. Writes: the user's
 * session; RLS allows only `author_id = auth.uid()`. An admin editing someone
 * else's listing is refused by RLS (no admin policy); that would need a
 * service-role path with an admin check in the service layer.
 */
export function createOpportunityRepository(
  clients: OpportunityClients = defaultClients(),
  options: { now?: () => Date } = {}
): OpportunityRepository {
  const state = { extraMissing: false };
  const now = options.now ?? (() => new Date());

  async function listAll(): Promise<Opportunity[]> {
    const client = await clients.reader();
    return hydrateOpportunities(client, await loadRows(client), undefined, now());
  }

  async function findWhere(match: (rows: OpportunityRow[]) => OpportunityRow | undefined) {
    const client = await clients.reader();
    const all = await loadRows(client);
    const row = match(all);
    if (!row) return undefined;
    const [item] = await hydrateOpportunities(client, all, [row], now());
    return item;
  }

  async function existingRow(client: SupabaseClient, id: string): Promise<OpportunityRow | undefined> {
    if (!isUuid(id)) return undefined;
    const { data, error } = await client.from("opportunities").select("*").eq("id", id).maybeSingle();
    check(error, "Could not load the opportunity");
    return (data as OpportunityRow | null) ?? undefined;
  }

  async function reread(client: SupabaseClient, id: string): Promise<Opportunity> {
    const all = await loadRows(client);
    const row = all.find((item) => item.id === id);
    if (!row) throw new TrackerWriteError("The opportunity was saved but could not be read back.");
    const [item] = await hydrateOpportunities(client, all, [row], now());
    return item;
  }

  return {
    listOpportunities: listAll,

    findOpportunity: async (id) => (isUuid(id) ? findWhere((rows) => rows.find((row) => row.id === id)) : undefined),

    findOpportunityBySlug: async (slug) =>
      findWhere((rows) => findBySlug(rows, assignSlugs(rows, (row) => row.title), slug)),

    listOpportunitiesByIds: async (ids) => {
      const wanted = ids.filter(isUuid);
      if (!wanted.length) return [];
      const client = await clients.reader();
      const all = await loadRows(client);
      const byId = new Map(all.map((row) => [row.id, row]));
      // Keep the caller's order, like the memory adapter.
      const rows = wanted.map((id) => byId.get(id)).filter((row): row is OpportunityRow => Boolean(row));
      return hydrateOpportunities(client, all, rows, now());
    },

    upsertOpportunity: async (item) => {
      const client = await clients.user();
      const userId = await currentUserId(client);
      const existing = await existingRow(client, item.id);
      const write = opportunityToRow(item, existing, now());

      if (existing) {
        if (existing.author_id !== userId) {
          throw new TrackerWriteError("Only the author can edit this opportunity.", "forbidden");
        }
        const { data, error } = await writeWithExtra(state, (withExtra) =>
          client
            .from("opportunities")
            .update({
              ...write.base,
              ...(withExtra ? write.extra : {}),
              updated_at: now().toISOString(),
            })
            .eq("id", existing.id)
            .select("id")
        );
        check(error, "Could not save the opportunity");
        if (!data || (Array.isArray(data) && data.length === 0)) {
          throw new TrackerWriteError("Only the author can edit this opportunity.", "forbidden");
        }
        return reread(client, existing.id);
      }

      // Siasa ids like "opp-…" are not uuids; the database assigns the id.
      const { data, error } = await writeWithExtra(state, (withExtra) =>
        client
          .from("opportunities")
          .insert({
            ...(isUuid(item.id) ? { id: item.id } : {}),
            ...write.base,
            ...(withExtra ? write.extra : {}),
            author_id: userId,
          })
          .select("id")
          .single()
      );
      check(error, "Could not create the opportunity");
      const created = data as unknown as { id: string } | null;
      if (!created) throw new TrackerWriteError("The opportunity was saved but could not be read back.");
      return reread(client, created.id);
    },

    deleteOpportunity: async (id) => {
      if (!isUuid(id)) return false;
      const client = await clients.user();
      // RLS: only the author may delete. Applications cascade.
      const { data, error } = await client.from("opportunities").delete().eq("id", id).select("id");
      check(error, "Could not delete the opportunity");
      return Array.isArray(data) && data.length > 0;
    },
  };
}
