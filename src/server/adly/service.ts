import { computeAdlyStats } from "@/data/adly";
import { slugify } from "@/lib/store";
import { getRepositories, usesTracker } from "@/server";
import {
  parseCampaign,
  parseCreative,
  parseInsight,
  parsePolicyReview,
  parsePoster,
  parseSimulation,
  parseTimelapse,
} from "@/server/adly/parse";
import { isRecord } from "@/server/content/parse";
import type { ContentActor, ContentResult } from "@/server/content/service";
import type { Leader, Project } from "@/types";
import type { AdlyContent, AdlyInsight, Campaign, Simulation } from "@/types/adly";

export const ADLY_COLLECTIONS = [
  "campaigns",
  "creatives",
  "policy-reviews",
  "posters",
  "timelapses",
  "simulations",
  "insights",
] as const;

export type AdlyCollection = (typeof ADLY_COLLECTIONS)[number];

function fail(status: number, error: string): ContentResult {
  return { ok: false, status, error };
}

function ok(body: Record<string, unknown>, status = 200): ContentResult {
  return { ok: true, status, body };
}

function isAdmin(actor: ContentActor): actor is Extract<ContentActor, { role: "admin" }> {
  return actor.role === "admin";
}

function adly() {
  return getRepositories().adly;
}

function civic() {
  return getRepositories().content;
}

/*
 * Project ownership. Tracker mode follows the Ownership rule
 * (docs/tracker-backend.md): the project's owner auth user id
 * (changemakers.user_id) against the verified session, or admin. Project
 * leaderIds / Leader.projectIds are not used there: they come from
 * political_figures.commissioned_projects, which a leader can write on their
 * own row. Memory mode keeps the leaderId links of the demo data.
 */
function projectOwned(
  actor: ContentActor,
  project: Project | undefined,
  leader: Leader | undefined
): boolean {
  if (!project) return false;
  if (isAdmin(actor)) return true;
  if (project.leaderIds.includes(actor.leaderId)) return true;
  return Boolean(leader?.projectIds.includes(project.id));
}

async function ownsProjectByUser(actor: ContentActor, projectId: string): Promise<boolean> {
  const owner = await civic().projectOwnerUserId?.(projectId);
  return Boolean(owner && owner === actor.userId);
}

async function ownsProject(actor: ContentActor, projectId: string | undefined): Promise<boolean> {
  if (!projectId) return true;
  if (usesTracker()) {
    if (!(await civic().findProject(projectId))) return false;
    return isAdmin(actor) || ownsProjectByUser(actor, projectId);
  }
  const project = await civic().findProject(projectId);
  if (!project) return false;
  const leader = isAdmin(actor) ? undefined : await civic().findLeader(actor.leaderId);
  return projectOwned(actor, project, leader);
}

/**
 * Ownership check for many projects at once. Memory mode loads projects and
 * the leader a single time; Tracker mode resolves the owner user id of each
 * project in `projectIds` (the projects the studio items point at) once.
 */
async function projectScope(
  actor: ContentActor,
  projectIds: Iterable<string | undefined>
): Promise<(projectId: string | undefined) => boolean> {
  if (usesTracker()) {
    if (isAdmin(actor)) return () => true;
    const owned = new Set<string>();
    const wanted = [...new Set([...projectIds].filter((id): id is string => Boolean(id)))];
    await Promise.all(
      wanted.map(async (id) => {
        if (await ownsProjectByUser(actor, id)) owned.add(id);
      })
    );
    return (projectId) => !projectId || owned.has(projectId);
  }
  const [projects, leader] = await Promise.all([
    civic().listProjects(),
    isAdmin(actor) ? undefined : civic().findLeader(actor.leaderId),
  ]);
  const byId = new Map(projects.map((project) => [project.id, project]));
  return (projectId) => !projectId || projectOwned(actor, byId.get(projectId), leader);
}

function ownsCampaign(actor: ContentActor, campaign: Campaign | undefined): boolean {
  if (!campaign) return false;
  return isAdmin(actor) || campaign.leaderId === actor.leaderId;
}

function creativeCampaigns(campaigns: Campaign[], creativeId: string): Campaign[] {
  return campaigns.filter((campaign) => campaign.creativeIds.includes(creativeId));
}

function ownsCreative(actor: ContentActor, campaigns: Campaign[], creativeId: string): boolean {
  if (isAdmin(actor)) return true;
  return creativeCampaigns(campaigns, creativeId).every((campaign) => campaign.leaderId === actor.leaderId);
}

function ownsInsight(actor: ContentActor, campaigns: Campaign[], insight: AdlyInsight): boolean {
  if (isAdmin(actor)) return true;
  if (insight.relatedCampaignId) {
    return ownsCampaign(actor, campaigns.find((item) => item.id === insight.relatedCampaignId));
  }
  if (insight.relatedCreativeId) {
    const users = creativeCampaigns(campaigns, insight.relatedCreativeId);
    return users.length > 0 && users.every((campaign) => campaign.leaderId === actor.leaderId);
  }
  return false;
}

export async function visibleAdly(actor: ContentActor): Promise<AdlyContent> {
  const all = await adly().snapshot();
  if (isAdmin(actor)) return all;
  const owns = await projectScope(actor, [
    ...all.timelapses.map((item) => item.projectId),
    ...all.simulations.map((item) => item.projectId),
  ]);
  const campaigns = all.campaigns.filter((item) => item.leaderId === actor.leaderId);
  const campaignIds = new Set(campaigns.map((item) => item.id));
  const creativeIds = new Set(campaigns.flatMap((item) => item.creativeIds));
  return {
    campaigns,
    creatives: all.creatives.filter((item) => creativeIds.has(item.id)),
    policyReviews: all.policyReviews.filter((item) => campaignIds.has(item.campaignId)),
    posters: all.posters.filter((item) => item.leaderId === actor.leaderId),
    timelapses: all.timelapses.filter((item) => owns(item.projectId)),
    simulations: all.simulations.filter((item) => {
      if (item.leaderId) return item.leaderId === actor.leaderId;
      return Boolean(item.projectId && owns(item.projectId));
    }),
    insights: all.insights.filter((item) => ownsInsight(actor, all.campaigns, item)),
  };
}

export async function readWorkspace(actor: ContentActor): Promise<ContentResult> {
  const content = await visibleAdly(actor);
  return ok({ ok: true, content, stats: computeAdlyStats(content) });
}

export async function listAdly(
  actor: ContentActor,
  collection: AdlyCollection,
  params: URLSearchParams
): Promise<ContentResult> {
  const id = params.get("id")?.trim();
  const visible = await visibleAdly(actor);
  const items = itemsOf(visible, collection);
  if (id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return fail(404, "Adly record not found.");
    return ok({ ok: true, item });
  }
  const leaderId = params.get("leaderId")?.trim();
  if (leaderId && isAdmin(actor) && collection === "campaigns") {
    return ok({
      ok: true,
      items: visible.campaigns.filter((item) => item.leaderId === leaderId),
    });
  }
  return ok({ ok: true, items });
}

export async function saveAdly(
  actor: ContentActor,
  collection: AdlyCollection,
  body: unknown
): Promise<ContentResult> {
  if (collection === "campaigns") return saveCampaign(actor, body);
  if (collection === "creatives") return saveCreative(actor, body);
  if (collection === "policy-reviews") return savePolicyReview(actor, body);
  if (collection === "posters") return savePoster(actor, body);
  if (collection === "timelapses") return saveTimelapse(actor, body);
  if (collection === "simulations") return saveSimulation(actor, body);
  return saveInsight(actor, body);
}

export async function deleteAdly(
  actor: ContentActor,
  collection: AdlyCollection,
  id: string
): Promise<ContentResult> {
  if (!id) return fail(400, "id is required.");
  if (collection === "campaigns") return deleteCampaign(actor, id);
  if (collection === "creatives") return deleteCreative(actor, id);
  if (collection === "policy-reviews") return deletePolicyReview(actor, id);
  if (collection === "posters") return deletePoster(actor, id);
  if (collection === "timelapses") return deleteTimelapse(actor, id);
  if (collection === "simulations") return deleteSimulation(actor, id);
  return deleteInsight(actor, id);
}

async function saveCampaign(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? await store.findCampaign(requestedId) : undefined;
  if (existing && !ownsCampaign(actor, existing)) {
    return fail(403, "You can only edit your own campaigns.");
  }
  const stamped = !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parseCampaign(stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (parsed.projectId && !(await ownsProject(actor, parsed.projectId))) {
    return fail(403, "That project is not on your profile.");
  }
  const campaigns = await store.listCampaigns();
  for (const creativeId of parsed.creativeIds) {
    if (!(await store.findCreative(creativeId))) return fail(400, "Campaign creative was not found.");
    if (!ownsCreative(actor, campaigns, creativeId)) {
      return fail(403, "You can only attach your own creatives.");
    }
  }
  parsed.slug = uniqueSlug(parsed.slug || slugify(parsed.name), parsed.id, (slug) =>
    campaigns.find((item) => item.slug === slug)?.id
  );
  const saved = await store.upsertCampaign(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function saveCreative(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? await store.findCreative(requestedId) : undefined;
  const campaigns = await store.listCampaigns();
  if (existing && !ownsCreative(actor, campaigns, existing.id)) {
    return fail(403, "You can only edit your own creatives.");
  }
  const parsed = parseCreative(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!ownsCreative(actor, campaigns, parsed.id)) {
    return fail(403, "You can only edit your own creatives.");
  }
  const saved = await store.upsertCreative(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function savePolicyReview(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? await store.findPolicyReview(requestedId) : undefined;
  if (existing && !ownsCampaign(actor, await store.findCampaign(existing.campaignId))) {
    return fail(403, "You can only review your own campaigns.");
  }
  const parsed = parsePolicyReview(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  const campaign = await store.findCampaign(parsed.campaignId);
  if (!campaign) return fail(400, "Policy review campaign was not found.");
  if (!ownsCampaign(actor, campaign)) return fail(403, "You can only review your own campaigns.");
  const saved = await store.upsertPolicyReview(parsed);
  if (campaign.policyReviewId !== saved.id) {
    await store.upsertCampaign({ ...campaign, policyReviewId: saved.id });
  }
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function savePoster(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? await store.findPoster(requestedId) : undefined;
  if (existing && !isAdmin(actor) && existing.leaderId !== actor.leaderId) {
    return fail(403, "You can only edit your own posters.");
  }
  const stamped = !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parsePoster(stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (parsed.projectId && !(await ownsProject(actor, parsed.projectId))) {
    return fail(403, "That project is not on your profile.");
  }
  const saved = await store.upsertPoster(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function saveTimelapse(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? await store.findTimelapse(requestedId) : undefined;
  if (existing && !(await ownsProject(actor, existing.projectId))) {
    return fail(403, "You can only edit timelapses for your projects.");
  }
  const parsed = parseTimelapse(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!(await ownsProject(actor, parsed.projectId))) {
    return fail(403, "You can only add timelapses to your projects.");
  }
  const saved = await store.upsertTimelapse(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function saveSimulation(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? await store.findSimulation(requestedId) : undefined;
  if (existing && !(await ownsSimulation(actor, existing))) {
    return fail(403, "You can only edit your own simulations.");
  }
  const stamped = !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parseSimulation(stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (parsed.projectId && !(await ownsProject(actor, parsed.projectId))) {
    return fail(403, "That project is not on your profile.");
  }
  const saved = await store.upsertSimulation(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

async function saveInsight(actor: ContentActor, body: unknown): Promise<ContentResult> {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId
    ? (await store.listInsights()).find((item) => item.id === requestedId)
    : undefined;
  const campaigns = await store.listCampaigns();
  if (existing && !ownsInsight(actor, campaigns, existing)) {
    return fail(403, "You can only edit your own insights.");
  }
  const parsed = parseInsight(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor) && !parsed.relatedCampaignId && !parsed.relatedCreativeId) {
    return fail(400, "An insight needs a related campaign or creative.");
  }
  if (!ownsInsight(actor, campaigns, parsed) && !isAdmin(actor)) {
    return fail(403, "You can only add insights to your own campaigns.");
  }
  if (existing) {
    await commit((content) => ({
      ...content,
      insights: content.insights.map((item) => (item.id === parsed.id ? parsed : item)),
    }));
    return ok({ ok: true, item: parsed });
  }
  await store.addInsight(parsed);
  return ok({ ok: true, item: parsed }, 201);
}

async function deleteCampaign(actor: ContentActor, id: string): Promise<ContentResult> {
  const store = adly();
  const campaign = await store.findCampaign(id);
  if (!campaign) return fail(404, "Campaign not found.");
  if (!ownsCampaign(actor, campaign)) return fail(403, "You can only delete your own campaigns.");
  await store.deleteCampaign(id);
  return ok({ ok: true });
}

async function deleteCreative(actor: ContentActor, id: string): Promise<ContentResult> {
  const creative = await adly().findCreative(id);
  if (!creative) return fail(404, "Creative not found.");
  if (!ownsCreative(actor, await adly().listCampaigns(), id)) {
    return fail(403, "You can only delete your own creatives.");
  }
  await commit((content) => ({
    ...content,
    creatives: content.creatives.filter((item) => item.id !== id),
    campaigns: content.campaigns.map((campaign) => ({
      ...campaign,
      creativeIds: campaign.creativeIds.filter((creativeId) => creativeId !== id),
    })),
  }));
  return ok({ ok: true });
}

async function deletePolicyReview(actor: ContentActor, id: string): Promise<ContentResult> {
  const review = await adly().findPolicyReview(id);
  if (!review) return fail(404, "Policy review not found.");
  if (!ownsCampaign(actor, await adly().findCampaign(review.campaignId))) {
    return fail(403, "You can only delete reviews on your own campaigns.");
  }
  await commit((content) => ({
    ...content,
    policyReviews: content.policyReviews.filter((item) => item.id !== id),
    campaigns: content.campaigns.map((campaign) =>
      campaign.policyReviewId === id ? { ...campaign, policyReviewId: undefined } : campaign
    ),
  }));
  return ok({ ok: true });
}

async function deletePoster(actor: ContentActor, id: string): Promise<ContentResult> {
  const poster = await adly().findPoster(id);
  if (!poster) return fail(404, "Poster not found.");
  if (!isAdmin(actor) && poster.leaderId !== actor.leaderId) {
    return fail(403, "You can only delete your own posters.");
  }
  await commit((content) => ({
    ...content,
    posters: content.posters.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

async function deleteTimelapse(actor: ContentActor, id: string): Promise<ContentResult> {
  const timelapse = await adly().findTimelapse(id);
  if (!timelapse) return fail(404, "Timelapse not found.");
  if (!(await ownsProject(actor, timelapse.projectId))) {
    return fail(403, "You can only delete timelapses for your projects.");
  }
  await commit((content) => ({
    ...content,
    timelapses: content.timelapses.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

async function deleteSimulation(actor: ContentActor, id: string): Promise<ContentResult> {
  const simulation = await adly().findSimulation(id);
  if (!simulation) return fail(404, "Simulation not found.");
  if (!(await ownsSimulation(actor, simulation))) {
    return fail(403, "You can only delete your own simulations.");
  }
  await commit((content) => ({
    ...content,
    simulations: content.simulations.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

async function deleteInsight(actor: ContentActor, id: string): Promise<ContentResult> {
  const insight = (await adly().listInsights()).find((item) => item.id === id);
  if (!insight) return fail(404, "Insight not found.");
  if (!ownsInsight(actor, await adly().listCampaigns(), insight)) {
    return fail(403, "You can only delete your own insights.");
  }
  await commit((content) => ({
    ...content,
    insights: content.insights.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

async function commit(change: (content: AdlyContent) => AdlyContent) {
  const store = adly();
  await store.replace(change(await store.snapshot()));
}

async function ownsSimulation(actor: ContentActor, simulation: Simulation): Promise<boolean> {
  if (isAdmin(actor)) return true;
  if (simulation.leaderId) return simulation.leaderId === actor.leaderId;
  return Boolean(simulation.projectId && (await ownsProject(actor, simulation.projectId)));
}

function itemsOf(content: AdlyContent, collection: AdlyCollection): Array<{ id: string }> {
  if (collection === "campaigns") return content.campaigns;
  if (collection === "creatives") return content.creatives;
  if (collection === "policy-reviews") return content.policyReviews;
  if (collection === "posters") return content.posters;
  if (collection === "timelapses") return content.timelapses;
  if (collection === "simulations") return content.simulations;
  return content.insights;
}

function uniqueSlug(desired: string, id: string, ownerOf: (slug: string) => string | undefined): string {
  const base = desired || id;
  if (!ownerOf(base) || ownerOf(base) === id) return base;
  let n = 2;
  while (ownerOf(`${base}-${n}`) && ownerOf(`${base}-${n}`) !== id) n += 1;
  return `${base}-${n}`;
}

function recordId(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  return asId(body.id);
}

function asId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
