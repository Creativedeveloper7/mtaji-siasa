import type { AuthSession } from "@/types/auth";
import type { Leader, MediaItem, Opportunity, Poll, Product, Project } from "@/types";
import { slugify } from "@/lib/store";
import { getRepositories, usesTracker } from "@/server";
import { failureFromError } from "@/server/http-errors";
import { ownerUserIdOf } from "@/server/tracker/content/media/shared";
import { isUuid } from "@/server/tracker/slug";
import { collectWarnings } from "@/server/tracker/warnings";
import {
  isRecord,
  parseLeader,
  parseMedia,
  parseMilestone,
  parseOpportunity,
  parsePoll,
  parseProduct,
  parseProject,
} from "@/server/content/parse";

export const CONTENT_COLLECTIONS = [
  "leaders",
  "projects",
  "milestones",
  "opportunities",
  "media",
  "polls",
  "products",
] as const;

export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

export type ContentActor =
  | { role: "admin"; userId: string }
  | { role: "leader" | "aspirant"; userId: string; leaderId: string };

export type ContentFailure = { ok: false; status: number; error: string };
export type ContentSuccess = { ok: true; status: number; body: Record<string, unknown> };
export type ContentResult = ContentFailure | ContentSuccess;

type LeaderLinkKey = "projectIds" | "opportunityIds" | "mediaIds" | "pollIds" | "productIds";

function fail(status: number, error: string): ContentFailure {
  return { ok: false, status, error };
}

function ok(body: Record<string, unknown>, status = 200): ContentSuccess {
  return { ok: true, status, body };
}

export function actorFromSession(session: AuthSession): ContentActor | ContentFailure {
  if (session.role === "admin") return { role: "admin", userId: session.userId };
  if (session.role === "leader" || session.role === "aspirant") {
    if (!session.leaderId) {
      return fail(403, "Your account is not linked to a leader profile.");
    }
    return { role: session.role, userId: session.userId, leaderId: session.leaderId };
  }
  return fail(403, "You do not have access to this.");
}

function isAdmin(actor: ContentActor): actor is Extract<ContentActor, { role: "admin" }> {
  return actor.role === "admin";
}

function content() {
  return getRepositories().content;
}

export async function readSnapshot(): Promise<ContentResult> {
  try {
    return ok({ ok: true, content: await content().snapshot() });
  } catch (error) {
    return failureFromError(error, "read content");
  }
}

export async function listCollection(
  collection: ContentCollection,
  params: URLSearchParams
): Promise<ContentResult> {
  try {
    return await readCollection(collection, params);
  } catch (error) {
    return failureFromError(error, `read ${collection}`);
  }
}

async function readCollection(collection: ContentCollection, params: URLSearchParams): Promise<ContentResult> {
  const id = params.get("id")?.trim() || undefined;
  const slug = params.get("slug")?.trim() || undefined;
  const leaderId = params.get("leaderId")?.trim() || undefined;
  const projectId = params.get("projectId")?.trim() || undefined;
  const store = content();

  if (collection === "leaders") {
    if (id) return one(await store.findLeader(id), "Leader");
    if (slug) return one(await store.findLeaderBySlug(slug), "Leader");
    return ok({ ok: true, items: await store.listLeaders() });
  }
  if (collection === "projects") {
    if (id) return one(await store.findProject(id), "Project");
    if (slug) return one(await store.findProjectBySlug(slug), "Project");
    const items = leaderId
      ? (await store.listProjects()).filter((item) => item.leaderIds.includes(leaderId))
      : await store.listProjects();
    return ok({ ok: true, items });
  }
  if (collection === "milestones") {
    if (id) return one(await store.findMilestone(id), "Milestone");
    if (projectId) return ok({ ok: true, items: await store.listMilestonesByProject(projectId) });
    return ok({ ok: true, items: await store.listMilestones() });
  }
  if (collection === "opportunities") {
    if (id) return one(await store.findOpportunity(id), "Opportunity");
    if (slug) return one(await store.findOpportunityBySlug(slug), "Opportunity");
    const items = leaderId
      ? (await store.listOpportunities()).filter((item) => item.leaderId === leaderId)
      : await store.listOpportunities();
    return ok({ ok: true, items });
  }
  if (collection === "media") {
    if (id) return one(await store.findMedia(id), "Media item");
    if (slug) return one(await store.findMediaBySlug(slug), "Media item");
    const items = leaderId
      ? (await store.listMedia()).filter((item) => item.leaderId === leaderId)
      : await store.listMedia();
    return ok({ ok: true, items });
  }
  if (collection === "polls") {
    if (id) return one(await store.findPoll(id), "Poll");
    if (slug) return one(await store.findPollBySlug(slug), "Poll");
    const items = leaderId
      ? (await store.listPolls()).filter((item) => item.leaderId === leaderId)
      : await store.listPolls();
    return ok({ ok: true, items });
  }
  if (id) return one(await store.findProduct(id), "Product");
  if (slug) return one(await store.findProductBySlug(slug), "Product");
  const items = leaderId ? await store.listProductsByLeader(leaderId) : await store.listProducts();
  return ok({ ok: true, items });
}

function one(item: unknown, label: string): ContentResult {
  if (!item) return fail(404, `${label} not found.`);
  return ok({ ok: true, item });
}

/**
 * Create or update one record. In Tracker mode the response carries
 * `warnings` when the repository had to leave data out (a Tracker migration
 * that is not applied yet). Repository errors become their HTTP status.
 */
export async function saveCollection(
  actor: ContentActor,
  collection: ContentCollection,
  body: unknown
): Promise<ContentResult> {
  try {
    const { result, warnings } = await collectWarnings(() => saveOne(actor, collection, body));
    if (result.ok && warnings.length) return { ...result, body: { ...result.body, warnings } };
    return result;
  } catch (error) {
    return failureFromError(error, `save ${collection}`);
  }
}

async function saveOne(actor: ContentActor, collection: ContentCollection, body: unknown): Promise<ContentResult> {
  if (collection === "leaders") return saveLeader(actor, body);
  if (collection === "projects") return saveProject(actor, body);
  if (collection === "milestones") return saveMilestone(actor, body);
  if (collection === "opportunities") return saveOwned(actor, body, "opportunity");
  if (collection === "media") return saveOwned(actor, body, "media");
  if (collection === "polls") return saveOwned(actor, body, "poll");
  return saveOwned(actor, body, "product");
}

export async function deleteCollection(
  actor: ContentActor,
  collection: ContentCollection,
  id: string
): Promise<ContentResult> {
  if (!id) return fail(400, "id is required.");
  try {
    return await deleteOne(actor, collection, id);
  } catch (error) {
    return failureFromError(error, `delete ${collection}`);
  }
}

async function deleteOne(actor: ContentActor, collection: ContentCollection, id: string): Promise<ContentResult> {
  if (collection === "leaders") return deleteLeader(actor, id);
  if (collection === "projects") return deleteProject(actor, id);
  if (collection === "milestones") return deleteMilestone(actor, id);
  if (collection === "opportunities") return deleteOwned(actor, id, "opportunity");
  if (collection === "media") return deleteOwned(actor, id, "media");
  if (collection === "polls") return deleteOwned(actor, id, "poll");
  return deleteOwned(actor, id, "product");
}

async function saveLeader(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = content();
  const tracker = usesTracker();
  const requestedId = isId(body);
  const existing = requestedId ? await store.findLeader(requestedId) : undefined;
  const parsed = parseLeader(body, existing, { stockPhoto: !tracker });
  if (typeof parsed === "string") return fail(400, parsed);

  if (tracker) {
    // Ownership rule: the figure's user_id against the verified session, or admin.
    if (existing && !ownsByUser(actor, existing)) {
      return fail(403, "You can only edit your own leader profile.");
    }
    // A politician may create their own political_figures row (the store sets
    // user_id to the caller and refuses a second one). Slug and link arrays
    // are derived by the Tracker adapter, so they are not computed here.
    const saved = await store.upsertLeader(parsed);
    return ok({ ok: true, item: saved }, existing ? 200 : 201);
  }

  if (!existing && !isAdmin(actor)) {
    return fail(403, "Only an admin can create a leader profile.");
  }
  if (existing && !isAdmin(actor) && existing.id !== actor.leaderId) {
    return fail(403, "You can only edit your own leader profile.");
  }
  const next: Leader = {
    ...parsed,
    slug: await uniqueSlug(parsed.slug, parsed.id, async (slug) => (await store.findLeaderBySlug(slug))?.id),
  };
  if (!isAdmin(actor) && existing) {
    next.id = existing.id;
    next.projectIds = existing.projectIds;
    next.opportunityIds = existing.opportunityIds;
    next.mediaIds = existing.mediaIds;
    next.pollIds = existing.pollIds;
    next.productIds = existing.productIds;
  }
  const saved = await store.upsertLeader(next);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function saveProject(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = content();
  const tracker = usesTracker();
  const requestedId = isId(body);
  const existing = requestedId ? await store.findProject(requestedId) : undefined;
  if (hiddenRecord(requestedId, existing)) return fail(404, "Project not found.");
  if (existing && !(await ownsProject(actor, existing))) {
    return fail(403, "You can only edit projects linked to your profile.");
  }
  const parsed = parseProject(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);

  if (tracker) {
    const next: Project = { ...parsed };
    // A new project always lists its creator. On update the leader list is
    // checked by the Tracker adapter (only an admin may add a co-leader).
    if (!existing && !isAdmin(actor) && !next.leaderIds.includes(actor.leaderId)) {
      next.leaderIds = [...next.leaderIds, actor.leaderId];
    }
    // Checked on create only: a Tracker project owned by an organisation has no leader.
    if (!existing && next.leaderIds.length === 0) return fail(400, "A project needs at least one leader.");
    const saved = await store.upsertProject(next);
    return ok({ ok: true, item: saved }, existing ? 200 : 201);
  }

  const next: Project = {
    ...parsed,
    slug: await uniqueSlug(parsed.slug, parsed.id, async (slug) => (await store.findProjectBySlug(slug))?.id),
  };
  if (!isAdmin(actor)) {
    const kept = new Set(existing?.leaderIds ?? []);
    kept.add(actor.leaderId);
    next.leaderIds = next.leaderIds.filter((id) => kept.has(id));
    if (!next.leaderIds.includes(actor.leaderId)) next.leaderIds.push(actor.leaderId);
  }
  if (next.leaderIds.length === 0) return fail(400, "A project needs at least one leader.");
  const saved = await store.upsertProject(next);
  await relinkLeaders("projectIds", saved.id, saved.leaderIds);
  return ok({ ok: true, item: (await store.findProject(saved.id)) ?? saved }, existing ? 200 : 201);
}

async function saveMilestone(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = content();
  const requestedId = isId(body);
  const existing = requestedId ? await store.findMilestone(requestedId) : undefined;
  if (hiddenRecord(requestedId, existing)) return fail(404, "Milestone not found.");
  if (existing && !(await ownsProjectId(actor, existing.projectId))) {
    return fail(403, "You can only edit milestones on your projects.");
  }
  const parsed = parseMilestone(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!(await ownsProjectId(actor, parsed.projectId))) {
    return fail(403, "You can only add milestones to your projects.");
  }
  const project = await store.findProject(parsed.projectId);
  if (!project) return fail(400, "Milestone project was not found.");
  const saved = await store.upsertMilestone(parsed);
  // Tracker: Project.milestoneIds is derived from milestones.initiative_id.
  if (usesTracker()) return ok({ ok: true, item: saved }, existing ? 200 : 201);
  if (!project.milestoneIds.includes(saved.id)) {
    await store.upsertProject({ ...project, milestoneIds: [...project.milestoneIds, saved.id] });
  }
  if (existing && existing.projectId !== saved.projectId) {
    const previous = await store.findProject(existing.projectId);
    if (previous) {
      await store.upsertProject({
        ...previous,
        milestoneIds: previous.milestoneIds.filter((id) => id !== saved.id),
      });
    }
  }
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

type OwnedKind = "opportunity" | "media" | "poll" | "product";

async function saveOwned(actor: ContentActor, body: unknown, kind: OwnedKind): Promise<ContentResult> {
  const requestedId = isId(body);
  const existing = requestedId ? await findOwned(kind, requestedId) : undefined;
  if (hiddenRecord(requestedId, existing)) return fail(404, "Record not found.");
  if (requestedId && existing && !ownsRecord(actor, existing)) {
    return fail(403, "You can only edit records linked to your profile.");
  }
  const stamped =
    !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parseOwned(kind, stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (kind === "product" && !parsed.leaderId) return fail(400, "Product leaderId is required.");
  const projectId = projectLinkOf(kind, parsed);
  // Tracker: a link that is already stored (an admin may have set it) is kept without a new check.
  const keptLink = usesTracker() && existing !== undefined && projectLinkOf(kind, existing) === projectId;
  if (projectId && !keptLink) {
    if (!(await content().findProject(projectId))) return fail(400, "Linked project was not found.");
    if (!(await ownsProjectId(actor, projectId))) {
      return fail(403, "You can only link records to your own projects.");
    }
  }
  if (usesTracker()) {
    // Slugs and the leader / project link arrays are derived by the Tracker adapter.
    const saved = await writeOwned(kind, parsed);
    return ok({ ok: true, item: saved }, existing ? 200 : 201);
  }
  parsed.slug = await uniqueSlug(parsed.slug || slugify(labelOf(parsed)) || parsed.id, parsed.id, (slug) => slugOwner(kind, slug));
  const saved = await writeOwned(kind, parsed);
  await relinkLeaders(linkKey(kind), saved.id, saved.leaderId ? [saved.leaderId] : []);
  if (kind === "opportunity" || kind === "media") {
    await relinkProjects(kind === "opportunity" ? "opportunityIds" : "mediaIds", saved.id, projectLinkOf(kind, saved));
  }
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function deleteLeader(actor: ContentActor, id: string): Promise<ContentResult> {
  if (!isAdmin(actor)) return fail(403, "Only an admin can delete a leader profile.");
  const store = content();
  if (!(await store.findLeader(id))) return fail(404, "Leader not found.");
  await store.deleteLeader(id);
  return ok({ ok: true });
}

async function deleteProject(actor: ContentActor, id: string): Promise<ContentResult> {
  const store = content();
  const project = await store.findProject(id);
  if (!project) return fail(404, "Project not found.");
  if (!(await ownsProject(actor, project))) return fail(403, "You can only delete projects linked to your profile.");
  if (usesTracker()) {
    // initiatives deletes cascade to donations (and milestones, volunteer and
    // job applications...): never drop money records with a project.
    if (((await store.projectDonationCount?.(id)) ?? 0) > 0) {
      return fail(409, "This project has donations; it can't be deleted.");
    }
  } else {
    // Memory mode has no cascade.
    for (const milestone of await store.listMilestonesByProject(id)) {
      await store.deleteMilestone(milestone.id);
    }
    await relinkLeaders("projectIds", id, []);
  }
  if (!(await store.deleteProject(id))) return fail(403, "You can only delete projects linked to your profile.");
  return ok({ ok: true });
}

async function deleteMilestone(actor: ContentActor, id: string): Promise<ContentResult> {
  const store = content();
  const milestone = await store.findMilestone(id);
  if (!milestone) return fail(404, "Milestone not found.");
  if (!(await ownsProjectId(actor, milestone.projectId))) {
    return fail(403, "You can only delete milestones on your projects.");
  }
  const project = usesTracker() ? undefined : await store.findProject(milestone.projectId);
  if (project) {
    await store.upsertProject({
      ...project,
      milestoneIds: project.milestoneIds.filter((itemId) => itemId !== id),
    });
  }
  await store.deleteMilestone(id);
  return ok({ ok: true });
}

async function deleteOwned(actor: ContentActor, id: string, kind: OwnedKind): Promise<ContentResult> {
  const existing = await findOwned(kind, id);
  if (!existing) return fail(404, "Record not found.");
  if (!ownsRecord(actor, existing)) {
    return fail(403, "You can only delete records linked to your profile.");
  }
  if (!usesTracker()) {
    await relinkLeaders(linkKey(kind), id, []);
    if (kind === "opportunity") await relinkProjects("opportunityIds", id, undefined);
    if (kind === "media") await relinkProjects("mediaIds", id, undefined);
  }
  const store = content();
  let removed: boolean;
  if (kind === "opportunity") removed = await store.deleteOpportunity(id);
  else if (kind === "media") removed = await store.deleteMedia(id);
  else if (kind === "poll") removed = await store.deletePoll(id);
  else removed = await store.deleteProduct(id);
  // Row-level security can refuse a delete by matching no row.
  if (!removed) return fail(403, "You can only delete records linked to your profile.");
  return ok({ ok: true });
}

/*
 * Ownership. Tracker mode follows the Ownership rule (docs/tracker-backend.md):
 * the row's owner auth user id against the verified session.userId, or admin.
 * leaderId is never used for authorization there (political_figures.id is
 * client-settable). Memory mode keeps the leaderId links of the demo data.
 */

/** Tracker: the record's ownerUserId (author / owner / figure user_id) is the caller. */
function ownsByUser(actor: ContentActor, record: object | undefined): boolean {
  if (isAdmin(actor)) return true;
  const owner = ownerUserIdOf(record);
  return Boolean(owner && owner === actor.userId);
}

async function ownsProject(actor: ContentActor, project: Project): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (usesTracker()) return ownsProjectByUser(actor, project.id);
  return project.leaderIds.includes(actor.leaderId);
}

async function ownsProjectByUser(actor: ContentActor, projectId: string): Promise<boolean> {
  const owner = await content().projectOwnerUserId?.(projectId);
  return Boolean(owner && owner === actor.userId);
}

async function ownsProjectId(actor: ContentActor, projectId: string): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (usesTracker()) return ownsProjectByUser(actor, projectId);
  const project = await content().findProject(projectId);
  return Boolean(project && project.leaderIds.includes(actor.leaderId));
}

function ownsRecord(actor: ContentActor, record: OwnedRecord): boolean {
  if (usesTracker()) return ownsByUser(actor, record);
  return isAdmin(actor) || record.leaderId === actor.leaderId;
}

type OwnedRecord = (Opportunity | MediaItem | Poll | Product) & { slug: string; leaderId?: string };

async function findOwned(kind: OwnedKind, id: string): Promise<OwnedRecord | undefined> {
  const store = content();
  if (kind === "opportunity") return store.findOpportunity(id);
  if (kind === "media") return store.findMedia(id);
  if (kind === "poll") return store.findPoll(id);
  return store.findProduct(id);
}

function parseOwned(kind: OwnedKind, body: unknown, existing: OwnedRecord | undefined): OwnedRecord | string {
  if (kind === "opportunity") return parseOpportunity(body, existing as Opportunity | undefined);
  if (kind === "media") return parseMedia(body, existing as MediaItem | undefined);
  if (kind === "poll") return parsePoll(body, existing as Poll | undefined);
  return parseProduct(body, existing as Product | undefined);
}

async function writeOwned(kind: OwnedKind, item: OwnedRecord): Promise<OwnedRecord> {
  const store = content();
  if (kind === "opportunity") return store.upsertOpportunity(item as Opportunity);
  if (kind === "media") return store.upsertMedia(item as MediaItem);
  if (kind === "poll") return store.upsertPoll(item as Poll);
  return store.upsertProduct(item as Product);
}

function labelOf(item: OwnedRecord): string {
  if ("title" in item && item.title) return item.title;
  if ("question" in item) return item.question;
  if ("name" in item) return item.name;
  return item.id;
}

async function slugOwner(kind: OwnedKind, slug: string): Promise<string | undefined> {
  const store = content();
  if (kind === "opportunity") return (await store.findOpportunityBySlug(slug))?.id;
  if (kind === "media") return (await store.findMediaBySlug(slug))?.id;
  if (kind === "poll") return (await store.findPollBySlug(slug))?.id;
  return (await store.findProductBySlug(slug))?.id;
}

function linkKey(kind: OwnedKind): LeaderLinkKey {
  if (kind === "opportunity") return "opportunityIds";
  if (kind === "media") return "mediaIds";
  if (kind === "poll") return "pollIds";
  return "productIds";
}

async function relinkLeaders(key: LeaderLinkKey, itemId: string, leaderIds: string[]) {
  const store = content();
  const wanted = new Set(leaderIds);
  for (const leader of await store.listLeaders()) {
    const has = leader[key].includes(itemId);
    const should = wanted.has(leader.id);
    if (has === should) continue;
    await store.upsertLeader({
      ...leader,
      [key]: should ? [...leader[key], itemId] : leader[key].filter((id) => id !== itemId),
    });
  }
}

function projectLinkOf(kind: OwnedKind, item: OwnedRecord): string | undefined {
  if (kind !== "opportunity" && kind !== "media") return undefined;
  return (item as Opportunity | MediaItem).projectId || undefined;
}

/** Keep project.opportunityIds / project.mediaIds in step with the child's projectId. */
async function relinkProjects(key: "opportunityIds" | "mediaIds", itemId: string, projectId: string | undefined) {
  const store = content();
  for (const project of await store.listProjects()) {
    const has = project[key].includes(itemId);
    const should = project.id === projectId;
    if (has === should) continue;
    await store.upsertProject({
      ...project,
      [key]: should ? [...project[key], itemId] : project[key].filter((id) => id !== itemId),
    });
  }
}

async function uniqueSlug(
  desired: string,
  id: string,
  ownerOf: (slug: string) => Promise<string | undefined>
): Promise<string> {
  const base = desired || id;
  const owner = await ownerOf(base);
  if (!owner || owner === id) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}-${n}`;
    const takenBy = await ownerOf(candidate);
    if (!takenBy || takenBy === id) return candidate;
    n += 1;
  }
}

/**
 * Tracker: a body id that is a uuid names a stored row (new records from the
 * forms carry a local `prefix-xxxx` id, or none). When the caller cannot read
 * that row (row-level security, or it does not exist) the save is refused
 * instead of creating a new row in its place.
 */
function hiddenRecord(requestedId: string | undefined, existing: unknown): boolean {
  return usesTracker() && existing === undefined && requestedId !== undefined && isUuid(requestedId);
}

function isId(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("id" in body)) return undefined;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}
