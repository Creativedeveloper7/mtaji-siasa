import type { AuthSession } from "@/types/auth";
import type { Leader, MediaItem, Opportunity, Poll, Product, Project } from "@/types";
import { slugify } from "@/lib/store";
import { getRepositories } from "@/server";
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

export function readSnapshot(): ContentSuccess {
  return ok({ ok: true, content: content().snapshot() });
}

export function listCollection(
  collection: ContentCollection,
  params: URLSearchParams
): ContentResult {
  const id = params.get("id")?.trim() || undefined;
  const slug = params.get("slug")?.trim() || undefined;
  const leaderId = params.get("leaderId")?.trim() || undefined;
  const projectId = params.get("projectId")?.trim() || undefined;
  const store = content();

  if (collection === "leaders") {
    if (id) return one(store.findLeader(id), "Leader");
    if (slug) return one(store.findLeaderBySlug(slug), "Leader");
    return ok({ ok: true, items: store.listLeaders() });
  }
  if (collection === "projects") {
    if (id) return one(store.findProject(id), "Project");
    if (slug) return one(store.findProjectBySlug(slug), "Project");
    const items = leaderId
      ? store.listProjects().filter((item) => item.leaderIds.includes(leaderId))
      : store.listProjects();
    return ok({ ok: true, items });
  }
  if (collection === "milestones") {
    if (id) return one(store.findMilestone(id), "Milestone");
    if (projectId) return ok({ ok: true, items: store.listMilestonesByProject(projectId) });
    return ok({ ok: true, items: store.listMilestones() });
  }
  if (collection === "opportunities") {
    if (id) return one(store.findOpportunity(id), "Opportunity");
    if (slug) return one(store.findOpportunityBySlug(slug), "Opportunity");
    const items = leaderId
      ? store.listOpportunities().filter((item) => item.leaderId === leaderId)
      : store.listOpportunities();
    return ok({ ok: true, items });
  }
  if (collection === "media") {
    if (id) return one(store.findMedia(id), "Media item");
    if (slug) return one(store.findMediaBySlug(slug), "Media item");
    const items = leaderId
      ? store.listMedia().filter((item) => item.leaderId === leaderId)
      : store.listMedia();
    return ok({ ok: true, items });
  }
  if (collection === "polls") {
    if (id) return one(store.findPoll(id), "Poll");
    if (slug) return one(store.findPollBySlug(slug), "Poll");
    const items = leaderId
      ? store.listPolls().filter((item) => item.leaderId === leaderId)
      : store.listPolls();
    return ok({ ok: true, items });
  }
  if (id) return one(store.findProduct(id), "Product");
  if (slug) return one(store.findProductBySlug(slug), "Product");
  const items = leaderId ? store.listProductsByLeader(leaderId) : store.listProducts();
  return ok({ ok: true, items });
}

function one(item: unknown, label: string): ContentResult {
  if (!item) return fail(404, `${label} not found.`);
  return ok({ ok: true, item });
}

export function saveCollection(
  actor: ContentActor,
  collection: ContentCollection,
  body: unknown
): ContentResult {
  if (collection === "leaders") return saveLeader(actor, body);
  if (collection === "projects") return saveProject(actor, body);
  if (collection === "milestones") return saveMilestone(actor, body);
  if (collection === "opportunities") return saveOwned(actor, body, "opportunity");
  if (collection === "media") return saveOwned(actor, body, "media");
  if (collection === "polls") return saveOwned(actor, body, "poll");
  return saveOwned(actor, body, "product");
}

export function deleteCollection(
  actor: ContentActor,
  collection: ContentCollection,
  id: string
): ContentResult {
  if (!id) return fail(400, "id is required.");
  if (collection === "leaders") return deleteLeader(actor, id);
  if (collection === "projects") return deleteProject(actor, id);
  if (collection === "milestones") return deleteMilestone(actor, id);
  if (collection === "opportunities") return deleteOwned(actor, id, "opportunity");
  if (collection === "media") return deleteOwned(actor, id, "media");
  if (collection === "polls") return deleteOwned(actor, id, "poll");
  return deleteOwned(actor, id, "product");
}

function saveLeader(actor: ContentActor, body: unknown): ContentResult {
  const store = content();
  const requestedId = isId(body);
  const existing = requestedId ? store.findLeader(requestedId) : undefined;
  if (requestedId && !existing) {
    /* create with the caller-supplied id */
  }
  const parsed = parseLeader(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!existing && !isAdmin(actor)) {
    return fail(403, "Only an admin can create a leader profile.");
  }
  if (existing && !isAdmin(actor) && existing.id !== actor.leaderId) {
    return fail(403, "You can only edit your own leader profile.");
  }
  const next: Leader = { ...parsed, slug: uniqueSlug(parsed.slug, parsed.id, (slug) => store.findLeaderBySlug(slug)?.id) };
  if (!isAdmin(actor) && existing) {
    next.id = existing.id;
    next.projectIds = existing.projectIds;
    next.opportunityIds = existing.opportunityIds;
    next.mediaIds = existing.mediaIds;
    next.pollIds = existing.pollIds;
    next.productIds = existing.productIds;
  }
  const saved = store.upsertLeader(next);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function saveProject(actor: ContentActor, body: unknown): ContentResult {
  const store = content();
  const requestedId = isId(body);
  const existing = requestedId ? store.findProject(requestedId) : undefined;
  if (existing && !ownsProject(actor, existing)) {
    return fail(403, "You can only edit projects linked to your profile.");
  }
  const parsed = parseProject(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  const next: Project = {
    ...parsed,
    slug: uniqueSlug(parsed.slug, parsed.id, (slug) => store.findProjectBySlug(slug)?.id),
  };
  if (!isAdmin(actor)) {
    const kept = new Set(existing?.leaderIds ?? []);
    kept.add(actor.leaderId);
    next.leaderIds = next.leaderIds.filter((id) => kept.has(id));
    if (!next.leaderIds.includes(actor.leaderId)) next.leaderIds.push(actor.leaderId);
  }
  if (next.leaderIds.length === 0) return fail(400, "A project needs at least one leader.");
  const saved = store.upsertProject(next);
  relinkLeaders("projectIds", saved.id, saved.leaderIds);
  return ok({ ok: true, item: store.findProject(saved.id) ?? saved }, existing ? 200 : 201);
}

function saveMilestone(actor: ContentActor, body: unknown): ContentResult {
  const store = content();
  const requestedId = isId(body);
  const existing = requestedId ? store.findMilestone(requestedId) : undefined;
  if (existing && !ownsProjectId(actor, existing.projectId)) {
    return fail(403, "You can only edit milestones on your projects.");
  }
  const parsed = parseMilestone(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!ownsProjectId(actor, parsed.projectId)) {
    return fail(403, "You can only add milestones to your projects.");
  }
  const project = store.findProject(parsed.projectId);
  if (!project) return fail(400, "Milestone project was not found.");
  const saved = store.upsertMilestone(parsed);
  if (!project.milestoneIds.includes(saved.id)) {
    store.upsertProject({ ...project, milestoneIds: [...project.milestoneIds, saved.id] });
  }
  if (existing && existing.projectId !== saved.projectId) {
    const previous = store.findProject(existing.projectId);
    if (previous) {
      store.upsertProject({
        ...previous,
        milestoneIds: previous.milestoneIds.filter((id) => id !== saved.id),
      });
    }
  }
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

type OwnedKind = "opportunity" | "media" | "poll" | "product";

function saveOwned(actor: ContentActor, body: unknown, kind: OwnedKind): ContentResult {
  const store = content();
  const requestedId = isId(body);
  const existing = requestedId ? findOwned(kind, requestedId) : undefined;
  if (requestedId && existing && !ownsRecord(actor, existing.leaderId)) {
    return fail(403, "You can only edit records linked to your profile.");
  }
  const stamped =
    !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parseOwned(kind, stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (kind === "product" && !parsed.leaderId) return fail(400, "Product leaderId is required.");
  parsed.slug = uniqueSlug(parsed.slug || slugify(labelOf(parsed)) || parsed.id, parsed.id, (slug) => slugOwner(kind, slug));
  const saved = writeOwned(kind, parsed);
  relinkLeaders(linkKey(kind), saved.id, saved.leaderId ? [saved.leaderId] : []);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function deleteLeader(actor: ContentActor, id: string): ContentResult {
  if (!isAdmin(actor)) return fail(403, "Only an admin can delete a leader profile.");
  const store = content();
  if (!store.findLeader(id)) return fail(404, "Leader not found.");
  store.deleteLeader(id);
  return ok({ ok: true });
}

function deleteProject(actor: ContentActor, id: string): ContentResult {
  const store = content();
  const project = store.findProject(id);
  if (!project) return fail(404, "Project not found.");
  if (!ownsProject(actor, project)) return fail(403, "You can only delete projects linked to your profile.");
  for (const milestone of store.listMilestonesByProject(id)) {
    store.deleteMilestone(milestone.id);
  }
  relinkLeaders("projectIds", id, []);
  store.deleteProject(id);
  return ok({ ok: true });
}

function deleteMilestone(actor: ContentActor, id: string): ContentResult {
  const store = content();
  const milestone = store.findMilestone(id);
  if (!milestone) return fail(404, "Milestone not found.");
  if (!ownsProjectId(actor, milestone.projectId)) {
    return fail(403, "You can only delete milestones on your projects.");
  }
  const project = store.findProject(milestone.projectId);
  if (project) {
    store.upsertProject({
      ...project,
      milestoneIds: project.milestoneIds.filter((itemId) => itemId !== id),
    });
  }
  store.deleteMilestone(id);
  return ok({ ok: true });
}

function deleteOwned(actor: ContentActor, id: string, kind: OwnedKind): ContentResult {
  const existing = findOwned(kind, id);
  if (!existing) return fail(404, "Record not found.");
  if (!ownsRecord(actor, existing.leaderId)) {
    return fail(403, "You can only delete records linked to your profile.");
  }
  relinkLeaders(linkKey(kind), id, []);
  const store = content();
  if (kind === "opportunity") store.deleteOpportunity(id);
  else if (kind === "media") store.deleteMedia(id);
  else if (kind === "poll") store.deletePoll(id);
  else store.deleteProduct(id);
  return ok({ ok: true });
}

function ownsProject(actor: ContentActor, project: Project): boolean {
  return isAdmin(actor) || project.leaderIds.includes(actor.leaderId);
}

function ownsProjectId(actor: ContentActor, projectId: string): boolean {
  if (isAdmin(actor)) return true;
  const project = content().findProject(projectId);
  return Boolean(project && project.leaderIds.includes(actor.leaderId));
}

function ownsRecord(actor: ContentActor, leaderId: string | undefined): boolean {
  return isAdmin(actor) || leaderId === actor.leaderId;
}

type OwnedRecord = (Opportunity | MediaItem | Poll | Product) & { slug: string; leaderId?: string };

function findOwned(kind: OwnedKind, id: string): OwnedRecord | undefined {
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

function writeOwned(kind: OwnedKind, item: OwnedRecord): OwnedRecord {
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

function slugOwner(kind: OwnedKind, slug: string): string | undefined {
  const store = content();
  if (kind === "opportunity") return store.findOpportunityBySlug(slug)?.id;
  if (kind === "media") return store.findMediaBySlug(slug)?.id;
  if (kind === "poll") return store.findPollBySlug(slug)?.id;
  return store.findProductBySlug(slug)?.id;
}

function linkKey(kind: OwnedKind): LeaderLinkKey {
  if (kind === "opportunity") return "opportunityIds";
  if (kind === "media") return "mediaIds";
  if (kind === "poll") return "pollIds";
  return "productIds";
}

function relinkLeaders(key: LeaderLinkKey, itemId: string, leaderIds: string[]) {
  const store = content();
  const wanted = new Set(leaderIds);
  for (const leader of store.listLeaders()) {
    const has = leader[key].includes(itemId);
    const should = wanted.has(leader.id);
    if (has === should) continue;
    store.upsertLeader({
      ...leader,
      [key]: should ? [...leader[key], itemId] : leader[key].filter((id) => id !== itemId),
    });
  }
}

function uniqueSlug(desired: string, id: string, ownerOf: (slug: string) => string | undefined): string {
  const base = desired || id;
  const owner = ownerOf(base);
  if (!owner || owner === id) return base;
  let n = 2;
  while (true) {
    const candidate = `${base}-${n}`;
    const takenBy = ownerOf(candidate);
    if (!takenBy || takenBy === id) return candidate;
    n += 1;
  }
}

function isId(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("id" in body)) return undefined;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

