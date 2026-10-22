import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Project, ProjectMilestone } from "@/types";
import type { ContentRepository } from "@/server/repositories";
import { serviceClient, userClient } from "@/server/tracker/clients";
import { assignSlugs, isUuid, rowSlug } from "@/server/tracker/slug";
import type { Promisified } from "@/server/tracker/types";
import {
  changemakerOwners,
  loadProjectLinks,
  mustOne,
  mustRows,
  readClient,
} from "./links";
import {
  buildInitiativeInsert,
  buildInitiativeUpdate,
  buildMilestoneInsert,
  buildMilestoneUpdate,
  EMPTY_LINKS,
  mapInitiative,
  mapMilestone,
  milestoneNumbers,
  parseSatelliteSnapshots,
  ProjectInputError,
  todayDate,
  withoutColumns,
  type Json,
  type SatelliteSnapshot,
} from "./mapping";
import {
  NEW_INITIATIVE_COLUMNS,
  NEW_MILESTONE_COLUMNS,
  type FigureLinkRow,
  type InitiativeRow,
  type MilestoneRow,
} from "./rows";

export type ProjectRepository = Pick<
  Promisified<ContentRepository>,
  | "listProjects"
  | "findProject"
  | "findProjectBySlug"
  | "listProjectsByIds"
  | "upsertProject"
  | "deleteProject"
  | "listMilestones"
  | "findMilestone"
  | "listMilestonesByProject"
  | "upsertMilestone"
  | "deleteMilestone"
>;

/** The signed-in user is not allowed to change this record (RLS refused or not the owner). */
export class ProjectAccessError extends Error {}

// ---------------------------------------------------------------------------
// Clients for writes

interface WriteContext {
  client: SupabaseClient;
  user: User;
  isAdmin: boolean;
}

async function writeContext(): Promise<WriteContext> {
  const client = await userClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ProjectAccessError("Sign in to change projects.");
  return { client, user: data.user, isAdmin: data.user.app_metadata?.role === "admin" };
}

/**
 * The owner writes with their own session (RLS: changemakers.user_id =
 * auth.uid()). An admin editing someone else's project needs the service
 * client: no RLS rule grants admins access (content-mapping.md §4, §16).
 * Anyone else gets their own session and RLS refuses the write.
 */
function clientFor(ctx: WriteContext, ownerUserId: string | null | undefined): SupabaseClient {
  if (ownerUserId && ownerUserId === ctx.user.id) return ctx.client;
  if (ctx.isAdmin) return serviceClient();
  return ctx.client;
}

/** Admins read through the service client so drafts and stalled rows of others are found. */
function readerFor(ctx: WriteContext): SupabaseClient {
  return ctx.isAdmin ? serviceClient() : ctx.client;
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703" || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? "");
}

/**
 * Insert, and when a §17 NEW column has not shipped yet, insert again
 * without the NEW columns.
 */
async function insertAdaptive<T>(
  client: SupabaseClient,
  table: string,
  payload: Json,
  newColumns: readonly string[]
): Promise<T> {
  const first = await client.from(table).insert(payload).select("*").single();
  if (!first.error) return first.data as T;
  if (isMissingColumn(first.error) && newColumns.some((c) => c in payload)) {
    const retry = await client.from(table).insert(withoutColumns(payload, newColumns)).select("*").single();
    if (!retry.error) return retry.data as T;
    throw writeError(retry.error, table);
  }
  throw writeError(first.error, table);
}

function writeError(error: { code?: string; message: string }, table: string): Error {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return new ProjectAccessError(`You cannot change this ${table === "milestones" ? "milestone" : "project"}.`);
  }
  if (error.code === "23514") return new ProjectInputError(`The Tracker rejected a value: ${error.message}`);
  return new Error(`Tracker ${table} write failed: ${error.message}`);
}

/** Update that must touch exactly one row; RLS silently matching nothing is an access error. */
async function updateOne(client: SupabaseClient, table: string, id: string, patch: Json): Promise<void> {
  const { data, error } = await client.from(table).update(patch).eq("id", id).select("id");
  if (error) throw writeError(error, table);
  if (!data || data.length === 0) {
    throw new ProjectAccessError(`You cannot change this ${table === "milestones" ? "milestone" : "project"}.`);
  }
}

// ---------------------------------------------------------------------------
// Reads

async function initiativeRows(client: SupabaseClient): Promise<InitiativeRow[]> {
  return mustRows<InitiativeRow>(
    await client.from("initiatives").select("*").order("created_at", { ascending: false }),
    "initiatives read"
  );
}

async function initiativeRow(client: SupabaseClient, id: string): Promise<InitiativeRow | null> {
  if (!isUuid(id)) return null;
  return mustOne<InitiativeRow>(
    await client.from("initiatives").select("*").eq("id", id).maybeSingle(),
    "initiatives read"
  );
}

/** Route slugs for every visible initiative (collisions get an id suffix, §2). */
async function slugIndex(client: SupabaseClient): Promise<{ rows: { id: string; title: string }[]; slugs: Map<string, string> }> {
  const rows = mustRows<{ id: string; title: string }>(
    await client.from("initiatives").select("id, title").order("created_at", { ascending: false }),
    "initiatives read"
  );
  return { rows, slugs: assignSlugs(rows, (row) => row.title, "full-id") };
}

async function mapRows(client: SupabaseClient, rows: InitiativeRow[], slugs?: Map<string, string>): Promise<Project[]> {
  const links = await loadProjectLinks(client, rows);
  const index = slugs ?? (await slugIndex(client)).slugs;
  const today = todayDate();
  return rows.map((row) =>
    mapInitiative(row, links.get(row.id) ?? EMPTY_LINKS, {
      slug: index.get(row.id) ?? rowSlug(row.title, row.id, "full-id"),
      today,
    })
  );
}

async function findWith(client: SupabaseClient, id: string): Promise<Project | undefined> {
  const row = await initiativeRow(client, id);
  if (!row) return undefined;
  return (await mapRows(client, [row]))[0];
}

/** Exact route slug, then `<base>-<8 hex>` against base slug + id prefix (§2). */
function resolveSlug(rows: { id: string; title: string }[], slugs: Map<string, string>, slug: string): string | undefined {
  const exact = rows.find((row) => slugs.get(row.id) === slug);
  if (exact) return exact.id;
  const match = /^(.*)-([0-9a-f]{8})$/i.exec(slug);
  if (!match) return undefined;
  const [, base, prefix] = match;
  return rows.find(
    (row) => row.id.toLowerCase().startsWith(prefix.toLowerCase()) && rowSlug(row.title, row.id, "full-id") === base
  )?.id;
}

async function milestoneRowsFor(client: SupabaseClient, projectIds?: string[]): Promise<MilestoneRow[]> {
  let query = client.from("milestones").select("*");
  if (projectIds) query = query.in("initiative_id", projectIds);
  return mustRows<MilestoneRow>(
    await query.order("target_date", { ascending: true }).order("created_at", { ascending: true }),
    "milestones read"
  );
}

function mapMilestoneRows(rows: MilestoneRow[]): ProjectMilestone[] {
  const numbers = milestoneNumbers(rows);
  return rows
    .map((row) => mapMilestone(row, numbers.get(row.id) ?? 0))
    .filter((m): m is ProjectMilestone => Boolean(m))
    .sort((a, b) => a.projectId.localeCompare(b.projectId) || a.number - b.number);
}

async function milestonesOf(client: SupabaseClient, projectId: string): Promise<ProjectMilestone[]> {
  if (!isUuid(projectId)) return [];
  return mapMilestoneRows(await milestoneRowsFor(client, [projectId]));
}

// ---------------------------------------------------------------------------
// Ownership

async function ownerOfChangemaker(client: SupabaseClient, changemakerId: string): Promise<string | null> {
  return (await changemakerOwners(client, [changemakerId])).get(changemakerId) ?? null;
}

/**
 * The user's changemakers row, created when missing (Tracker ensureChangemaker).
 * email stays null: changemakers.email is UNIQUE. The oldest row wins if a
 * race ever made two.
 */
async function ensureChangemaker(client: SupabaseClient, userId: string, displayName: string): Promise<string> {
  const find = async () =>
    mustRows<{ id: string }>(
      await client
        .from("changemakers")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1),
      "changemakers read"
    )[0]?.id;
  const existing = await find();
  if (existing) return existing;
  const created = await client
    .from("changemakers")
    .insert({ user_id: userId, name: displayName.trim() || "Changemaker" })
    .select("id")
    .single();
  if (!created.error && created.data) return (created.data as { id: string }).id;
  const retry = await find();
  if (retry) return retry;
  throw writeError(created.error ?? { message: "no row returned" }, "changemakers");
}

async function figuresByIds(client: SupabaseClient, ids: string[]): Promise<(FigureLinkRow & { name: string })[]> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  return mustRows<FigureLinkRow & { name: string }>(
    await client.from("political_figures").select("id, user_id, commissioned_projects, name").in("id", valid),
    "political_figures read"
  );
}

/**
 * Owner of a new project. Normally the signed-in user. An admin creating a
 * project for a leader makes that leader's user the owner (first listed
 * leader with an account), as long as the admin is not one of the leaders.
 */
async function newProjectOwner(ctx: WriteContext, leaderIds: string[]): Promise<{ userId: string; name: string }> {
  const figures = await figuresByIds(ctx.isAdmin ? serviceClient() : ctx.client, leaderIds);
  const mine = figures.find((f) => f.user_id === ctx.user.id);
  const metaName = typeof ctx.user.user_metadata?.full_name === "string" ? ctx.user.user_metadata.full_name : "";
  if (mine || !ctx.isAdmin) return { userId: ctx.user.id, name: mine?.name || metaName || "Changemaker" };
  for (const id of leaderIds) {
    const figure = figures.find((f) => f.id === id && f.user_id);
    if (figure?.user_id) return { userId: figure.user_id, name: figure.name };
  }
  return { userId: ctx.user.id, name: metaName || "Changemaker" };
}

/**
 * Co-leaders live in political_figures.commissioned_projects (§4). The owner's
 * own figure is implied and never stored. A leader can add or remove only
 * themself; an admin can link anyone (service client). Other changes are
 * skipped, never forced.
 */
async function syncCoLeaders(
  ctx: WriteContext,
  projectId: string,
  ownerUserId: string | null,
  leaderIds: string[]
): Promise<void> {
  const reader = readerFor(ctx);
  const desired = new Set(leaderIds.filter(isUuid));
  const current = mustRows<FigureLinkRow>(
    await reader
      .from("political_figures")
      .select("id, user_id, commissioned_projects")
      .contains("commissioned_projects", [projectId]),
    "political_figures read"
  );
  const wanted = (await figuresByIds(reader, [...desired])).filter((f) => !ownerUserId || f.user_id !== ownerUserId);
  const changes: { figure: FigureLinkRow; next: string[] }[] = [];
  for (const figure of wanted) {
    const list = figure.commissioned_projects ?? [];
    if (!list.includes(projectId)) changes.push({ figure, next: [...list, projectId] });
  }
  for (const figure of current) {
    if (!desired.has(figure.id)) {
      changes.push({ figure, next: (figure.commissioned_projects ?? []).filter((id) => id !== projectId) });
    }
  }
  for (const { figure, next } of changes) {
    const client = figure.user_id === ctx.user.id ? ctx.client : ctx.isAdmin ? serviceClient() : undefined;
    if (!client) continue;
    const { error } = await client.from("political_figures").update({ commissioned_projects: next }).eq("id", figure.id);
    if (error) throw writeError(error, "political_figures");
  }
}

// ---------------------------------------------------------------------------
// Repository

export function createProjectRepository(): ProjectRepository {
  return {
    async listProjects() {
      const client = await readClient();
      const rows = await initiativeRows(client);
      return mapRows(client, rows, assignSlugs(rows, (row) => row.title, "full-id"));
    },

    async findProject(id) {
      if (!isUuid(id)) return undefined;
      return findWith(await readClient(), id);
    },

    async findProjectBySlug(slug) {
      const client = await readClient();
      if (isUuid(slug)) return findWith(client, slug);
      const { rows, slugs } = await slugIndex(client);
      const id = resolveSlug(rows, slugs, slug);
      if (!id) return undefined;
      const row = await initiativeRow(client, id);
      return row ? (await mapRows(client, [row], slugs))[0] : undefined;
    },

    async listProjectsByIds(ids) {
      const wanted = [...new Set(ids.filter(isUuid))];
      if (wanted.length === 0) return [];
      const client = await readClient();
      const rows = mustRows<InitiativeRow>(
        await client.from("initiatives").select("*").in("id", wanted),
        "initiatives read"
      );
      const byId = new Map((await mapRows(client, rows)).map((p) => [p.id, p]));
      return wanted.map((id) => byId.get(id)).filter((p): p is Project => Boolean(p));
    },

    async upsertProject(item) {
      const ctx = await writeContext();
      const reader = readerFor(ctx);
      const existing = isUuid(item.id) ? await initiativeRow(reader, item.id) : null;

      if (existing) {
        const ownerUserId = await ownerOfChangemaker(reader, existing.changemaker_id);
        const client = clientFor(ctx, ownerUserId);
        const links = (await loadProjectLinks(reader, [existing])).get(existing.id) ?? EMPTY_LINKS;
        const patch = buildInitiativeUpdate(existing, item, { links, today: todayDate() });
        if (Object.keys(patch).length > 0) await updateOne(client, "initiatives", existing.id, patch);
        if (!sameIds(item.leaderIds, links.leaderIds)) {
          await syncCoLeaders(ctx, existing.id, ownerUserId, item.leaderIds);
        }
        return (await findWith(client, existing.id)) ?? item;
      }

      const owner = await newProjectOwner(ctx, item.leaderIds);
      const client = clientFor(ctx, owner.userId);
      const changemakerId = await ensureChangemaker(client, owner.userId, owner.name);
      const payload = buildInitiativeInsert(item, { changemakerId });
      if (isUuid(item.id)) payload.id = item.id;
      const created = await insertAdaptive<InitiativeRow>(client, "initiatives", payload, NEW_INITIATIVE_COLUMNS);
      await syncCoLeaders(ctx, created.id, owner.userId, item.leaderIds);
      return (await findWith(client, created.id)) ?? (await mapRows(client, [created]))[0];
    },

    async deleteProject(id) {
      if (!isUuid(id)) return false;
      const ctx = await writeContext();
      const reader = readerFor(ctx);
      const existing = await initiativeRow(reader, id);
      if (!existing) return false;
      const ownerUserId = await ownerOfChangemaker(reader, existing.changemaker_id);
      const { data, error } = await clientFor(ctx, ownerUserId).from("initiatives").delete().eq("id", id).select("id");
      if (error) throw writeError(error, "initiatives");
      if (!data || data.length === 0) return false;
      // commissioned_projects has no FK: drop the stale ids where the caller may write.
      await syncCoLeaders(ctx, id, ownerUserId, []);
      return true;
    },

    async listMilestones() {
      return mapMilestoneRows(await milestoneRowsFor(await readClient()));
    },

    async findMilestone(id) {
      if (!isUuid(id)) return undefined;
      const client = await readClient();
      const row = mustOne<MilestoneRow>(
        await client.from("milestones").select("initiative_id").eq("id", id).maybeSingle(),
        "milestones read"
      );
      if (!row) return undefined;
      return (await milestonesOf(client, row.initiative_id)).find((m) => m.id === id);
    },

    async listMilestonesByProject(projectId) {
      return milestonesOf(await readClient(), projectId);
    },

    async upsertMilestone(item) {
      if (!isUuid(item.projectId)) throw new ProjectInputError("Milestone project was not found.");
      const ctx = await writeContext();
      const reader = readerFor(ctx);
      const project = await initiativeRow(reader, item.projectId);
      if (!project) throw new ProjectInputError("Milestone project was not found.");
      const client = clientFor(ctx, await ownerOfChangemaker(reader, project.changemaker_id));
      const existing = isUuid(item.id)
        ? mustOne<MilestoneRow>(await reader.from("milestones").select("*").eq("id", item.id).maybeSingle(), "milestones read")
        : null;
      const now = new Date();
      let id: string;
      if (existing) {
        if (existing.initiative_id !== project.id) {
          // Moving a milestone: the caller must also be allowed on the old project.
          // RLS checks both rows for the owner; an admin needs both to be checked here.
          const previous = await initiativeRow(reader, existing.initiative_id);
          const previousOwner = previous ? await ownerOfChangemaker(reader, previous.changemaker_id) : null;
          if (!ctx.isAdmin && previousOwner !== ctx.user.id) {
            throw new ProjectAccessError("You cannot move this milestone.");
          }
        }
        const patch = buildMilestoneUpdate(existing, item, now);
        if (Object.keys(patch).length > 0) await updateOne(client, "milestones", existing.id, patch);
        id = existing.id;
      } else {
        const payload = buildMilestoneInsert(item, now);
        if (isUuid(item.id)) payload.id = item.id;
        id = (await insertAdaptive<MilestoneRow>(client, "milestones", payload, NEW_MILESTONE_COLUMNS)).id;
      }
      const saved = (await milestonesOf(client, project.id)).find((m) => m.id === id);
      // A milestone saved as cancelled elsewhere cannot come back through Siasa's three statuses.
      return saved ?? { ...item, id, projectId: project.id };
    },

    async deleteMilestone(id) {
      if (!isUuid(id)) return false;
      const ctx = await writeContext();
      const reader = readerFor(ctx);
      const row = mustOne<MilestoneRow>(
        await reader.from("milestones").select("id, initiative_id").eq("id", id).maybeSingle(),
        "milestones read"
      );
      if (!row) return false;
      const project = await initiativeRow(reader, row.initiative_id);
      const owner = project ? await ownerOfChangemaker(reader, project.changemaker_id) : null;
      const { data, error } = await clientFor(ctx, owner).from("milestones").delete().eq("id", id).select("id");
      if (error) throw writeError(error, "milestones");
      return Boolean(data && data.length > 0);
    },
  };
}

function sameIds(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/**
 * Satellite frames of a project for the timelapse (§13): the Tracker's
 * satellite_snapshots, read only, oldest first. [] when the project is not visible.
 */
export async function listProjectSatelliteSnapshots(projectId: string): Promise<SatelliteSnapshot[]> {
  if (!isUuid(projectId)) return [];
  const client = await readClient();
  const row = mustOne<{ satellite_snapshots: unknown }>(
    await client.from("initiatives").select("satellite_snapshots").eq("id", projectId).maybeSingle(),
    "initiatives read"
  );
  return parseSatelliteSnapshots(row?.satellite_snapshots).sort((a, b) =>
    String(a.date ?? "").localeCompare(String(b.date ?? ""))
  );
}
