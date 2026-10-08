import { computeAdlyStats } from "@/data/adly";
import { slugify } from "@/lib/store";
import { getRepositories } from "@/server";
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

function ownsProject(actor: ContentActor, projectId: string | undefined): boolean {
  if (!projectId) return true;
  const project = civic().findProject(projectId);
  if (!project) return false;
  if (isAdmin(actor)) return true;
  if (project.leaderIds.includes(actor.leaderId)) return true;
  const leader = civic().findLeader(actor.leaderId);
  return Boolean(leader?.projectIds.includes(projectId));
}

function ownsCampaign(actor: ContentActor, campaign: Campaign | undefined): boolean {
  if (!campaign) return false;
  return isAdmin(actor) || campaign.leaderId === actor.leaderId;
}

function creativeCampaigns(creativeId: string): Campaign[] {
  return adly().listCampaigns().filter((campaign) => campaign.creativeIds.includes(creativeId));
}

function ownsCreative(actor: ContentActor, creativeId: string): boolean {
  if (isAdmin(actor)) return true;
  return creativeCampaigns(creativeId).every((campaign) => campaign.leaderId === actor.leaderId);
}

function ownsInsight(actor: ContentActor, insight: AdlyInsight): boolean {
  if (isAdmin(actor)) return true;
  if (insight.relatedCampaignId) {
    return ownsCampaign(actor, adly().findCampaign(insight.relatedCampaignId));
  }
  if (insight.relatedCreativeId) {
    const users = creativeCampaigns(insight.relatedCreativeId);
    return users.length > 0 && users.every((campaign) => campaign.leaderId === actor.leaderId);
  }
  return false;
}

export function visibleAdly(actor: ContentActor): AdlyContent {
  const all = adly().snapshot();
  if (isAdmin(actor)) return all;
  const campaigns = all.campaigns.filter((item) => item.leaderId === actor.leaderId);
  const campaignIds = new Set(campaigns.map((item) => item.id));
  const creativeIds = new Set(campaigns.flatMap((item) => item.creativeIds));
  return {
    campaigns,
    creatives: all.creatives.filter((item) => creativeIds.has(item.id)),
    policyReviews: all.policyReviews.filter((item) => campaignIds.has(item.campaignId)),
    posters: all.posters.filter((item) => item.leaderId === actor.leaderId),
    timelapses: all.timelapses.filter((item) => ownsProject(actor, item.projectId)),
    simulations: all.simulations.filter((item) => {
      if (item.leaderId) return item.leaderId === actor.leaderId;
      return Boolean(item.projectId && ownsProject(actor, item.projectId));
    }),
    insights: all.insights.filter((item) => ownsInsight(actor, item)),
  };
}

export function readWorkspace(actor: ContentActor): ContentResult {
  const content = visibleAdly(actor);
  return ok({ ok: true, content, stats: computeAdlyStats(content) });
}

export function listAdly(
  actor: ContentActor,
  collection: AdlyCollection,
  params: URLSearchParams
): ContentResult {
  const id = params.get("id")?.trim();
  const visible = visibleAdly(actor);
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

export function saveAdly(
  actor: ContentActor,
  collection: AdlyCollection,
  body: unknown
): ContentResult {
  if (collection === "campaigns") return saveCampaign(actor, body);
  if (collection === "creatives") return saveCreative(actor, body);
  if (collection === "policy-reviews") return savePolicyReview(actor, body);
  if (collection === "posters") return savePoster(actor, body);
  if (collection === "timelapses") return saveTimelapse(actor, body);
  if (collection === "simulations") return saveSimulation(actor, body);
  return saveInsight(actor, body);
}

export function deleteAdly(
  actor: ContentActor,
  collection: AdlyCollection,
  id: string
): ContentResult {
  if (!id) return fail(400, "id is required.");
  if (collection === "campaigns") return deleteCampaign(actor, id);
  if (collection === "creatives") return deleteCreative(actor, id);
  if (collection === "policy-reviews") return deletePolicyReview(actor, id);
  if (collection === "posters") return deletePoster(actor, id);
  if (collection === "timelapses") return deleteTimelapse(actor, id);
  if (collection === "simulations") return deleteSimulation(actor, id);
  return deleteInsight(actor, id);
}

function saveCampaign(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.findCampaign(requestedId) : undefined;
  if (existing && !ownsCampaign(actor, existing)) {
    return fail(403, "You can only edit your own campaigns.");
  }
  const stamped = !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parseCampaign(stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (parsed.projectId && !ownsProject(actor, parsed.projectId)) {
    return fail(403, "That project is not on your profile.");
  }
  for (const creativeId of parsed.creativeIds) {
    if (!store.findCreative(creativeId)) return fail(400, "Campaign creative was not found.");
    if (!ownsCreative(actor, creativeId)) {
      return fail(403, "You can only attach your own creatives.");
    }
  }
  parsed.slug = uniqueSlug(parsed.slug || slugify(parsed.name), parsed.id, (slug) =>
    store.listCampaigns().find((item) => item.slug === slug)?.id
  );
  const saved = store.upsertCampaign(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function saveCreative(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.findCreative(requestedId) : undefined;
  if (existing && !ownsCreative(actor, existing.id)) {
    return fail(403, "You can only edit your own creatives.");
  }
  const parsed = parseCreative(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!ownsCreative(actor, parsed.id)) {
    return fail(403, "You can only edit your own creatives.");
  }
  const saved = store.upsertCreative(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function savePolicyReview(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.findPolicyReview(requestedId) : undefined;
  if (existing && !ownsCampaign(actor, store.findCampaign(existing.campaignId))) {
    return fail(403, "You can only review your own campaigns.");
  }
  const parsed = parsePolicyReview(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  const campaign = store.findCampaign(parsed.campaignId);
  if (!campaign) return fail(400, "Policy review campaign was not found.");
  if (!ownsCampaign(actor, campaign)) return fail(403, "You can only review your own campaigns.");
  const saved = store.upsertPolicyReview(parsed);
  if (campaign.policyReviewId !== saved.id) {
    store.upsertCampaign({ ...campaign, policyReviewId: saved.id });
  }
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function savePoster(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.findPoster(requestedId) : undefined;
  if (existing && !isAdmin(actor) && existing.leaderId !== actor.leaderId) {
    return fail(403, "You can only edit your own posters.");
  }
  const stamped = !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parsePoster(stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (parsed.projectId && !ownsProject(actor, parsed.projectId)) {
    return fail(403, "That project is not on your profile.");
  }
  const saved = store.upsertPoster(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function saveTimelapse(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.findTimelapse(requestedId) : undefined;
  if (existing && !ownsProject(actor, existing.projectId)) {
    return fail(403, "You can only edit timelapses for your projects.");
  }
  const parsed = parseTimelapse(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!ownsProject(actor, parsed.projectId)) {
    return fail(403, "You can only add timelapses to your projects.");
  }
  const saved = store.upsertTimelapse(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function saveSimulation(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.findSimulation(requestedId) : undefined;
  if (existing && !ownsSimulation(actor, existing)) {
    return fail(403, "You can only edit your own simulations.");
  }
  const stamped = !isAdmin(actor) && isRecord(body) ? { ...body, leaderId: actor.leaderId } : body;
  const parsed = parseSimulation(stamped, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor)) parsed.leaderId = actor.leaderId;
  if (parsed.projectId && !ownsProject(actor, parsed.projectId)) {
    return fail(403, "That project is not on your profile.");
  }
  const saved = store.upsertSimulation(parsed);
  return ok({ ok: true, item: saved }, existing ? 200 : 201);
}

function saveInsight(actor: ContentActor, body: unknown): ContentResult {
  const store = adly();
  const requestedId = recordId(body);
  const existing = requestedId ? store.listInsights().find((item) => item.id === requestedId) : undefined;
  if (existing && !ownsInsight(actor, existing)) {
    return fail(403, "You can only edit your own insights.");
  }
  const parsed = parseInsight(body, existing);
  if (typeof parsed === "string") return fail(400, parsed);
  if (!isAdmin(actor) && !parsed.relatedCampaignId && !parsed.relatedCreativeId) {
    return fail(400, "An insight needs a related campaign or creative.");
  }
  if (!ownsInsight(actor, parsed) && !isAdmin(actor)) {
    return fail(403, "You can only add insights to your own campaigns.");
  }
  if (existing) {
    commit((content) => ({
      ...content,
      insights: content.insights.map((item) => (item.id === parsed.id ? parsed : item)),
    }));
    return ok({ ok: true, item: parsed });
  }
  store.addInsight(parsed);
  return ok({ ok: true, item: parsed }, 201);
}

function deleteCampaign(actor: ContentActor, id: string): ContentResult {
  const store = adly();
  const campaign = store.findCampaign(id);
  if (!campaign) return fail(404, "Campaign not found.");
  if (!ownsCampaign(actor, campaign)) return fail(403, "You can only delete your own campaigns.");
  store.deleteCampaign(id);
  return ok({ ok: true });
}

function deleteCreative(actor: ContentActor, id: string): ContentResult {
  const creative = adly().findCreative(id);
  if (!creative) return fail(404, "Creative not found.");
  if (!ownsCreative(actor, id)) return fail(403, "You can only delete your own creatives.");
  commit((content) => ({
    ...content,
    creatives: content.creatives.filter((item) => item.id !== id),
    campaigns: content.campaigns.map((campaign) => ({
      ...campaign,
      creativeIds: campaign.creativeIds.filter((creativeId) => creativeId !== id),
    })),
  }));
  return ok({ ok: true });
}

function deletePolicyReview(actor: ContentActor, id: string): ContentResult {
  const review = adly().findPolicyReview(id);
  if (!review) return fail(404, "Policy review not found.");
  if (!ownsCampaign(actor, adly().findCampaign(review.campaignId))) {
    return fail(403, "You can only delete reviews on your own campaigns.");
  }
  commit((content) => ({
    ...content,
    policyReviews: content.policyReviews.filter((item) => item.id !== id),
    campaigns: content.campaigns.map((campaign) =>
      campaign.policyReviewId === id ? { ...campaign, policyReviewId: undefined } : campaign
    ),
  }));
  return ok({ ok: true });
}

function deletePoster(actor: ContentActor, id: string): ContentResult {
  const poster = adly().findPoster(id);
  if (!poster) return fail(404, "Poster not found.");
  if (!isAdmin(actor) && poster.leaderId !== actor.leaderId) {
    return fail(403, "You can only delete your own posters.");
  }
  commit((content) => ({
    ...content,
    posters: content.posters.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

function deleteTimelapse(actor: ContentActor, id: string): ContentResult {
  const timelapse = adly().findTimelapse(id);
  if (!timelapse) return fail(404, "Timelapse not found.");
  if (!ownsProject(actor, timelapse.projectId)) {
    return fail(403, "You can only delete timelapses for your projects.");
  }
  commit((content) => ({
    ...content,
    timelapses: content.timelapses.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

function deleteSimulation(actor: ContentActor, id: string): ContentResult {
  const simulation = adly().findSimulation(id);
  if (!simulation) return fail(404, "Simulation not found.");
  if (!ownsSimulation(actor, simulation)) {
    return fail(403, "You can only delete your own simulations.");
  }
  commit((content) => ({
    ...content,
    simulations: content.simulations.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

function deleteInsight(actor: ContentActor, id: string): ContentResult {
  const insight = adly().listInsights().find((item) => item.id === id);
  if (!insight) return fail(404, "Insight not found.");
  if (!ownsInsight(actor, insight)) return fail(403, "You can only delete your own insights.");
  commit((content) => ({
    ...content,
    insights: content.insights.filter((item) => item.id !== id),
  }));
  return ok({ ok: true });
}

function commit(change: (content: AdlyContent) => AdlyContent) {
  const store = adly();
  store.replace(change(store.snapshot()));
}

function ownsSimulation(actor: ContentActor, simulation: Simulation): boolean {
  if (isAdmin(actor)) return true;
  if (simulation.leaderId) return simulation.leaderId === actor.leaderId;
  return Boolean(simulation.projectId && ownsProject(actor, simulation.projectId));
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
