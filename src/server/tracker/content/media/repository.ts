import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaItem } from "@/types";
import type { ContentRepository } from "@/server/repositories";
import type { Promisified } from "@/server/tracker/types";
import { assignSlugs, findBySlug, isUuid, rowSlug } from "@/server/tracker/slug";
import {
  BLOG_NEW_COLUMNS,
  blogNewColumnsEmpty,
  blogWrite,
  mapBlogRow,
  type BlogRow,
} from "./mapping";
import {
  ContentWriteError,
  defaultContentClients,
  fail,
  figuresForUsers,
  optionalUserClient,
  readRowForWrite,
  requireCaller,
  resolveOwner,
  type ContentClients,
} from "./session";
import { groupIdsByOwner, isMissingColumnError, leaderIdForOwner, pickByIds } from "./shared";

export type MediaRepository = Pick<
  Promisified<ContentRepository>,
  "listMedia" | "findMedia" | "findMediaBySlug" | "listMediaByIds" | "upsertMedia" | "deleteMedia"
>;

/**
 * MediaItem on public.blogs (content-mapping.md §8).
 *
 * Reads: anon, status = 'published' (RLS). findMedia(id) also finds the
 * caller's own unpublished Tracker drafts through their session, so an owner
 * can open and publish one.
 * Writes: the caller's session (RLS author_id = auth.uid()); an admin writing
 * another leader's post uses the service client (see resolveOwner).
 * Slugs are derived over all published rows (assignSlugs), so collisions get
 * the `-<id8>` suffix. M1's generated `slug` column mirrors the same base
 * formula; until then the table (2 rows) is matched in memory.
 */
export function createMediaRepository(clients: ContentClients = defaultContentClients): MediaRepository {
  async function loadPublic(): Promise<MediaItem[]> {
    const anon = clients.anon();
    const { data, error } = await anon
      .from("blogs")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false });
    if (error) fail("Could not load media", error);
    const rows = (data ?? []) as BlogRow[];
    return mapRows(anon, rows, rows);
  }

  async function findOwnDraft(id: string): Promise<MediaItem | undefined> {
    const client = await optionalUserClient(clients);
    if (!client) return undefined;
    const { data, error } = await client.from("blogs").select("*").eq("id", id).maybeSingle();
    if (error || !data) return undefined;
    const row = data as BlogRow;
    const [item] = await mapRows(client, [row], [row]);
    return item;
  }

  async function findMedia(id: string): Promise<MediaItem | undefined> {
    if (!isUuid(id)) return undefined;
    const item = (await loadPublic()).find((media) => media.id === id);
    return item ?? findOwnDraft(id);
  }

  return {
    listMedia: loadPublic,
    findMedia,
    async findMediaBySlug(slug) {
      const items = await loadPublic();
      return findBySlug(items, new Map(items.map((item) => [item.id, item.slug])), slug);
    },
    async listMediaByIds(ids) {
      return pickByIds(await loadPublic(), ids);
    },
    async upsertMedia(item) {
      const caller = await requireCaller(clients);
      const existing = await readRowForWrite<BlogRow>(caller, clients, "blogs", item.id);
      const target = await resolveOwner(caller, clients, existing ? { ownerId: existing.author_id } : null, item.leaderId);
      const initiativeName = await initiativeTitle(target.client, item.projectId);
      const write = blogWrite(item, { existing, ownerName: target.ownerName, initiativeName });
      const row = await writeBlog(target.client, write, existing ? { id: existing.id } : { authorId: target.ownerId });
      return (await findMedia(row.id)) ?? (await mapRows(target.client, [row], [row]))[0];
    },
    async deleteMedia(id) {
      const caller = await requireCaller(clients);
      const existing = await readRowForWrite<BlogRow>(caller, clients, "blogs", id);
      if (!existing) return false;
      const target = await resolveOwner(caller, clients, { ownerId: existing.author_id }, undefined);
      const { data, error } = await target.client.from("blogs").delete().eq("id", id).select("id");
      if (error) fail("Could not delete the media item", error);
      return (data ?? []).length > 0;
    },
  };
}

/** Maps rows; `slugScope` is the set slugs are made unique within. */
async function mapRows(client: SupabaseClient, rows: BlogRow[], slugScope: BlogRow[]): Promise<MediaItem[]> {
  const slugs = assignSlugs(slugScope, (row) => row.title);
  const figures = await figuresForUsers(client, rows.map((row) => row.author_id));
  const byInitiative = groupIdsByOwner(slugScope, (row) => row.initiative_id);
  const opportunities = await opportunityIdsByInitiative(client, [...byInitiative.keys()]);
  return rows.map((row) =>
    mapBlogRow(row, {
      slug: slugs.get(row.id) ?? rowSlug(row.title, row.id),
      leaderId: leaderIdForOwner(row.author_id, figures),
      relatedMediaIds: row.initiative_id
        ? (byInitiative.get(row.initiative_id) ?? []).filter((id) => id !== row.id)
        : [],
      relatedOpportunityIds: row.initiative_id ? opportunities.get(row.initiative_id) ?? [] : [],
    })
  );
}

/** Published opportunities on the same initiative (§8 relatedOpportunityIds). Optional: errors give none. */
async function opportunityIdsByInitiative(client: SupabaseClient, initiativeIds: string[]): Promise<Map<string, string[]>> {
  if (!initiativeIds.length) return new Map();
  const { data, error } = await client
    .from("opportunities")
    .select("id, initiative_id")
    .eq("listing_status", "published")
    .in("initiative_id", initiativeIds);
  if (error) return new Map();
  return groupIdsByOwner((data ?? []) as { id: string; initiative_id: string | null }[], (row) => row.initiative_id);
}

async function initiativeTitle(client: SupabaseClient, projectId: string | undefined): Promise<string | null> {
  if (!projectId) return null;
  if (!isUuid(projectId)) throw new ContentWriteError(400, "Linked project was not found.");
  const { data, error } = await client.from("initiatives").select("title").eq("id", projectId).maybeSingle();
  if (error) fail("Could not load the linked project", error);
  if (!data) throw new ContentWriteError(400, "Linked project was not found.");
  return (data as { title: string }).title;
}

/**
 * The one call site that writes blogs. If M5b (gallery, video_url) is not
 * applied yet, the write is retried without those columns when they hold no
 * data; when they do, it fails loudly instead of dropping the gallery/video.
 */
async function writeBlog(
  client: SupabaseClient,
  write: Record<string, unknown>,
  mode: { id: string } | { authorId: string }
): Promise<BlogRow> {
  const run = (payload: Record<string, unknown>) =>
    "id" in mode
      ? client.from("blogs").update(payload).eq("id", mode.id).select("*").single()
      : client.from("blogs").insert({ ...payload, author_id: mode.authorId }).select("*").single();

  let result = await run(write);
  if (result.error && isMissingColumnError(result.error, [...BLOG_NEW_COLUMNS])) {
    if (!blogNewColumnsEmpty(write)) {
      throw new ContentWriteError(
        501,
        "Gallery photos and video links need a Tracker update (migration M5b) before they can be saved."
      );
    }
    const legacy = { ...write };
    for (const column of BLOG_NEW_COLUMNS) delete legacy[column];
    result = await run(legacy);
  }
  if (result.error) fail("Could not save the media item", result.error);
  return result.data as BlogRow;
}

/**
 * Links helper for the leaders slice: auth user id -> ids of their published
 * blogs (Leader.mediaIds = blogs.author_id = uid(leader), §3). Pass the
 * political_figures.user_id values; figures with user_id null own nothing.
 * Uses anon, so only published rows are counted. Ids keep published_at desc order.
 */
export async function mediaIdsByAuthor(
  authorIds: string[],
  client: SupabaseClient = defaultContentClients.anon()
): Promise<Map<string, string[]>> {
  const ids = [...new Set(authorIds.filter(isUuid))];
  if (!ids.length) return new Map();
  const { data, error } = await client
    .from("blogs")
    .select("id, author_id")
    .eq("status", "published")
    .in("author_id", ids)
    .order("published_at", { ascending: false, nullsFirst: false });
  if (error) fail("Could not load media links", error);
  return groupIdsByOwner((data ?? []) as { id: string; author_id: string }[], (row) => row.author_id);
}
