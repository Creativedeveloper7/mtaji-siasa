import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, TrackerConfigError, userClient } from "@/server/tracker/clients";
import { isUuid } from "@/server/tracker/slug";
import { phase1LeaderId } from "@/server/tracker/content/media/shared";
import type { ProjectLinks } from "./mapping";
import type { ChangemakerRow, FigureLinkRow, InitiativeRow } from "./rows";

/**
 * Derived link arrays between projects (initiatives) and leaders
 * (political_figures), shared with the leaders, opportunities and media slices.
 *
 * Contract (docs/content-mapping.md §3, §4):
 * - A project's owner is changemakers.user_id of initiatives.changemaker_id.
 * - Leader → projects = initiatives owned by the leader's user
 *   ∪ political_figures.commissioned_projects (filtered to rows the reader can see).
 * - Project → leaders = [figure whose user_id is the owner] ∪ figures whose
 *   commissioned_projects contain the project. May be empty (non-politician owners).
 * - Visibility is whatever RLS allows the client: anon sees published, active
 *   and completed rows (and only `status = 'active'` figures); a signed-in
 *   owner also sees their drafts.
 */

/**
 * The signed-in user's client when there is a request with cookies, else anon.
 * RLS makes this "public rows, plus my own drafts".
 */
export async function readClient(): Promise<SupabaseClient> {
  try {
    return await userClient();
  } catch (error) {
    if (error instanceof TrackerConfigError) throw error;
    // cookies() is unavailable outside a request (build, scripts): public read.
    return anonClient();
  }
}

type Result = { data: unknown; error: { message: string } | null };

/** Rows of a list query; throws on a query error. */
export function mustRows<T>(result: Result, what: string): T[] {
  if (result.error) throw new Error(`Tracker ${what} failed: ${result.error.message}`);
  return (Array.isArray(result.data) ? result.data : []) as T[];
}

/** Row of a maybeSingle() query (null when absent); throws on a query error. */
export function mustOne<T>(result: Result, what: string): T | null {
  if (result.error) throw new Error(`Tracker ${what} failed: ${result.error.message}`);
  return (result.data ?? null) as T | null;
}

function uuids(ids: Iterable<string>): string[] {
  return [...new Set([...ids].filter((id) => typeof id === "string" && isUuid(id)))];
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

/** changemakers.id → user_id for the given changemaker ids. */
export async function changemakerOwners(
  client: SupabaseClient,
  changemakerIds: string[]
): Promise<Map<string, string | null>> {
  const ids = uuids(changemakerIds);
  const owners = new Map<string, string | null>();
  if (ids.length === 0) return owners;
  const rows = mustRows<Pick<ChangemakerRow, "id" | "user_id">>(
    await client.from("changemakers").select("id, user_id").in("id", ids),
    "changemakers read"
  );
  for (const row of rows) owners.set(row.id, row.user_id);
  return owners;
}

/** Figures that own (by user) or were commissioned on any of these projects. */
async function figuresFor(
  client: SupabaseClient,
  ownerUserIds: string[],
  projectIds: string[]
): Promise<FigureLinkRow[]> {
  const users = uuids(ownerUserIds);
  const projects = uuids(projectIds);
  const [byUser, byCommission] = await Promise.all([
    users.length
      ? client.from("political_figures").select("id, user_id, commissioned_projects").in("user_id", users)
      : Promise.resolve({ data: [], error: null }),
    projects.length
      ? client
          .from("political_figures")
          .select("id, user_id, commissioned_projects")
          .overlaps("commissioned_projects", projects)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const rows = [
    ...mustRows<FigureLinkRow>(byUser, "political_figures read"),
    ...mustRows<FigureLinkRow>(byCommission, "political_figures read"),
  ];
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}

/**
 * leaderIds per project: the owner's figure first, then commissioned figures.
 * Every requested project id is in the map (possibly with []).
 */
export function leaderIdsFrom(
  projects: Pick<InitiativeRow, "id" | "changemaker_id">[],
  owners: Map<string, string | null>,
  figures: FigureLinkRow[]
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const project of projects) {
    result.set(project.id, []);
    const owner = owners.get(project.changemaker_id);
    if (owner) {
      for (const figure of figures) if (figure.user_id === owner) push(result, project.id, figure.id);
      // An owner without a political_figures row: their Phase 1 leader id
      // (`user-<uid>`, never the bare uid), as media/polls/products do.
      if (!result.get(project.id)?.length) push(result, project.id, phase1LeaderId(owner));
    }
  }
  for (const figure of figures) {
    for (const projectId of figure.commissioned_projects ?? []) {
      if (result.has(projectId)) push(result, projectId, figure.id);
    }
  }
  return result;
}

/** All derived links for a set of initiative rows, in parallel queries. */
export async function loadProjectLinks(
  client: SupabaseClient,
  rows: Pick<InitiativeRow, "id" | "changemaker_id">[]
): Promise<Map<string, ProjectLinks>> {
  const ids = rows.map((row) => row.id);
  const links = new Map<string, ProjectLinks>(
    rows.map((row) => [
      row.id,
      { leaderIds: [], milestones: [], opportunityIds: [], mediaIds: [], hasPublishedOpportunity: false },
    ])
  );
  if (ids.length === 0) return links;

  const [milestones, opportunities, blogs, owners] = await Promise.all([
    client
      .from("milestones")
      .select("id, initiative_id, status, target_date, created_at")
      .in("initiative_id", ids),
    client
      .from("opportunities")
      .select("id, initiative_id, listing_status, created_at")
      .in("initiative_id", ids)
      .order("created_at", { ascending: false }),
    client
      .from("blogs")
      .select("id, initiative_id, created_at")
      .in("initiative_id", ids)
      .order("created_at", { ascending: false }),
    changemakerOwners(client, rows.map((row) => row.changemaker_id)),
  ]);
  const figures = await figuresFor(client, [...owners.values()].filter((v): v is string => Boolean(v)), ids);
  const leaders = leaderIdsFrom(rows, owners, figures);

  for (const m of mustRows<{ id: string; initiative_id: string; status: string; target_date: string; created_at: string | null }>(
    milestones,
    "milestones read"
  )) {
    links.get(m.initiative_id)?.milestones.push(m);
  }
  for (const o of mustRows<{ id: string; initiative_id: string; listing_status: string | null }>(
    opportunities,
    "opportunities read"
  )) {
    const link = links.get(o.initiative_id);
    if (!link) continue;
    link.opportunityIds.push(o.id);
    if (o.listing_status === "published") link.hasPublishedOpportunity = true;
  }
  for (const b of mustRows<{ id: string; initiative_id: string }>(blogs, "blogs read")) {
    links.get(b.initiative_id)?.mediaIds.push(b.id);
  }
  for (const [id, leaderIds] of leaders) {
    const link = links.get(id);
    if (link) link.leaderIds = leaderIds;
  }
  for (const row of rows) {
    const link = links.get(row.id);
    const owner = owners.get(row.changemaker_id);
    if (link && owner) link.ownerUserId = owner;
  }
  return links;
}

// ---------------------------------------------------------------------------
// Helpers for other slices

/**
 * Project ids owned by each user (through their changemakers rows), newest
 * first. Every requested user id is in the map.
 */
export async function projectIdsByOwner(
  userIds: string[],
  client?: SupabaseClient
): Promise<Map<string, string[]>> {
  const db = client ?? (await readClient());
  const users = uuids(userIds);
  const result = new Map<string, string[]>(userIds.map((id) => [id, []]));
  if (users.length === 0) return result;
  const makers = mustRows<Pick<ChangemakerRow, "id" | "user_id">>(
    await db.from("changemakers").select("id, user_id").in("user_id", users),
    "changemakers read"
  );
  if (makers.length === 0) return result;
  const userOf = new Map(makers.map((m) => [m.id, m.user_id as string]));
  const rows = mustRows<Pick<InitiativeRow, "id" | "changemaker_id">>(
    await db
      .from("initiatives")
      .select("id, changemaker_id")
      .in("changemaker_id", [...userOf.keys()])
      .order("created_at", { ascending: false }),
    "initiatives read"
  );
  for (const row of rows) {
    const user = userOf.get(row.changemaker_id);
    if (user) push(result, user, row.id);
  }
  return result;
}

/**
 * Leader.projectIds for political_figures rows: owned ∪ commissioned, keeping
 * only initiatives the client can see. Every figure id is in the map.
 */
export async function projectIdsForFigures(
  figures: FigureLinkRow[],
  client?: SupabaseClient
): Promise<Map<string, string[]>> {
  const db = client ?? (await readClient());
  const owned = await projectIdsByOwner(
    figures.map((f) => f.user_id).filter((id): id is string => Boolean(id)),
    db
  );
  const commissioned = uuids(figures.flatMap((f) => f.commissioned_projects ?? []));
  const visible = new Set<string>();
  if (commissioned.length) {
    const rows = mustRows<{ id: string }>(
      await db.from("initiatives").select("id").in("id", commissioned),
      "initiatives read"
    );
    for (const row of rows) visible.add(row.id);
  }
  const result = new Map<string, string[]>();
  for (const figure of figures) {
    const list = [...(figure.user_id ? owned.get(figure.user_id) ?? [] : [])];
    for (const id of figure.commissioned_projects ?? []) if (visible.has(id) && !list.includes(id)) list.push(id);
    result.set(figure.id, list);
  }
  return result;
}

/** Project.leaderIds for the given project ids (political_figures ids). */
export async function leaderIdsForProjects(
  projectIds: string[],
  client?: SupabaseClient
): Promise<Map<string, string[]>> {
  const db = client ?? (await readClient());
  const ids = uuids(projectIds);
  if (ids.length === 0) return new Map(projectIds.map((id) => [id, []]));
  const rows = mustRows<Pick<InitiativeRow, "id" | "changemaker_id">>(
    await db.from("initiatives").select("id, changemaker_id").in("id", ids),
    "initiatives read"
  );
  const owners = await changemakerOwners(db, rows.map((r) => r.changemaker_id));
  const figures = await figuresFor(db, [...owners.values()].filter((v): v is string => Boolean(v)), ids);
  const result = leaderIdsFrom(rows, owners, figures);
  for (const id of projectIds) if (!result.has(id)) result.set(id, []);
  return result;
}

/**
 * auth user id that owns a project (for "you can only link to your own
 * project" checks in other slices). undefined when the project is not visible
 * or its changemaker has no user.
 */
export async function projectOwnerUserId(
  projectId: string,
  client?: SupabaseClient
): Promise<string | undefined> {
  if (!isUuid(projectId)) return undefined;
  const db = client ?? (await readClient());
  const row = mustOne<Pick<InitiativeRow, "id" | "changemaker_id">>(
    await db.from("initiatives").select("id, changemaker_id").eq("id", projectId).maybeSingle(),
    "initiatives read"
  );
  if (!row) return undefined;
  return (await changemakerOwners(db, [row.changemaker_id])).get(row.changemaker_id) ?? undefined;
}

/** initiatives.title by id (blogs.initiative_name is a denormalised copy). */
export async function projectTitles(
  projectIds: string[],
  client?: SupabaseClient
): Promise<Map<string, string>> {
  const ids = uuids(projectIds);
  if (ids.length === 0) return new Map();
  const db = client ?? (await readClient());
  const rows = mustRows<{ id: string; title: string }>(
    await db.from("initiatives").select("id, title").in("id", ids),
    "initiatives read"
  );
  return new Map(rows.map((row) => [row.id, row.title]));
}

/**
 * Number of donations rows for a project (initiative). Deleting an initiative
 * cascades to its donations, so the content service refuses a delete when
 * this is above 0. donations has a public SELECT policy, so the reader's
 * client sees every row.
 */
export async function projectDonationCount(
  projectId: string,
  client?: SupabaseClient
): Promise<number> {
  if (!isUuid(projectId)) return 0;
  const db = client ?? (await readClient());
  const { count, error } = await db
    .from("donations")
    .select("id", { count: "exact", head: true })
    .eq("initiative_id", projectId);
  if (error) throw new Error(`Tracker donations read failed: ${error.message}`);
  return count ?? 0;
}
