import type { AdCampaign, AdPlatform, AdPlatformRun } from "@/types";
import type { AuthSession } from "@/types/auth";
import { createId } from "@/lib/store";
import { getRepositories } from "@/server";
import { asString, isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";
import { trackerAdSettings } from "@/server/tracker/adly/config";
import { chargeWallet, refundWallet, walletBalance } from "@/server/wallet/service";

/**
 * Paid ads for the MEMORY store only (local demo, MTAJI_STORE=memory or no
 * Supabase settings). The campaigns routes use src/server/tracker/adly on the
 * Tracker backend. Nothing here talks to an ad network: launches, pauses and
 * results are simulated on the memory wallet. Network credentials live only
 * in the Tracker's Supabase function secrets.
 */

function adSettings() {
  const kesPerUsd = Number(process.env.AD_KES_PER_USD);
  return { ...trackerAdSettings(), kesPerUsd: Number.isFinite(kesPerUsd) && kesPerUsd > 0 ? kesPerUsd : 129 };
}

/** Every network is "available" in the demo: nothing is sent anywhere. */
function platformConfigured(_platform: AdPlatform): boolean {
  return true;
}

export const LIMITS = {
  headline: 30,
  body: 220, // leaves room for the link inside X's 280 characters
  keywords: 20,
  keywordLength: 80,
  minDays: 1,
  maxDays: 30,
} as const;

const PLATFORMS: readonly AdPlatform[] = ["x", "google"];

function fail(status: number, error: string): ContentResult {
  return { ok: false, status, error };
}

function ok(body: Record<string, unknown>, status = 200): ContentResult {
  return { ok: true, status, body };
}

const repo = () => getRepositories().adCampaigns;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pricing shown in the composer. */
export function adQuote() {
  const s = adSettings();
  return {
    kesPerUsd: s.kesPerUsd,
    reachPerKes: s.reachPerKes,
    minBudgetKes: s.minBudgetKes,
    maxBudgetKes: s.maxBudgetKes,
    requireApproval: s.requireApproval,
    limits: LIMITS,
    platforms: PLATFORMS.map((platform) => ({ platform, configured: platformConfigured(platform) })),
  };
}

function canManage(session: AuthSession, campaign: AdCampaign): boolean {
  return session.role === "admin" || (Boolean(session.leaderId) && session.leaderId === campaign.leaderId);
}

function save(campaign: AdCampaign): Promise<AdCampaign> {
  return repo().upsert({ ...campaign, updatedAt: new Date().toISOString() });
}

export async function listAdCampaigns(
  session: AuthSession,
  scope: "mine" | "all"
): Promise<ContentResult> {
  const all = await repo().list();
  if (scope === "all") {
    if (session.role !== "admin") return fail(403, "Only an admin can see every campaign.");
    return ok({ ok: true, items: all, quote: adQuote() });
  }
  if (!session.leaderId) return fail(403, "Your account is not linked to a leader profile.");
  return ok({
    ok: true,
    items: all.filter((item) => item.leaderId === session.leaderId),
    quote: adQuote(),
    walletBalance: await walletBalance(session.leaderId),
  });
}

function landingUrl(origin: string, slug: string): string {
  const base = adSettings().siteUrl || origin;
  return `${base}/projects/${slug}`;
}

/** Ad networks reject links that are not public https sites (localhost, IPs, bare hostnames). */
function isPublicUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      hostname.includes(".") &&
      !/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/.test(hostname) &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/** Validate the composer, charge the wallet and either queue for approval or launch. */
export async function createAdCampaign(
  session: AuthSession,
  body: unknown,
  origin: string
): Promise<ContentResult> {
  if (session.role !== "leader" && session.role !== "aspirant") {
    return fail(403, "Only leaders and aspirants can run ads from their dashboard.");
  }
  if (!session.leaderId) return fail(403, "Your account is not linked to a leader profile.");
  if (!isRecord(body)) return fail(400, "Campaign body must be an object.");
  const settings = adSettings();

  const project = await getRepositories().content.findProject(asString(body.projectId) ?? "");
  if (!project || !project.leaderIds.includes(session.leaderId)) {
    return fail(400, "Choose one of your own projects to promote.");
  }
  if (!project.image) return fail(400, "Add a project image before running an ad.");

  const headline = asString(body.headline) ?? "";
  const text = asString(body.body) ?? "";
  if (!headline) return fail(400, "Add a headline.");
  if (headline.length > LIMITS.headline) return fail(400, `Keep the headline to ${LIMITS.headline} characters.`);
  if (!text) return fail(400, "Add the ad text.");
  if (text.length > LIMITS.body) return fail(400, `Keep the ad text to ${LIMITS.body} characters.`);

  const keywords = Array.from(
    new Set(
      (Array.isArray(body.keywords) ? body.keywords : [])
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim().replace(/\s+/g, " "))
        .filter(Boolean)
    )
  );
  if (keywords.length === 0) return fail(400, "Add at least one keyword.");
  if (keywords.length > LIMITS.keywords) return fail(400, `Use at most ${LIMITS.keywords} keywords.`);
  if (keywords.some((k) => k.length > LIMITS.keywordLength)) {
    return fail(400, `Keywords must be ${LIMITS.keywordLength} characters or fewer.`);
  }

  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter(
    (p): p is AdPlatform => PLATFORMS.includes(p as AdPlatform)
  );
  if (platforms.length === 0) return fail(400, "Choose at least one network: X or Google.");
  const missing = platforms.filter((p) => !platformConfigured(p));
  if (missing.length) return fail(400, `${missing.join(" and ")} ads are not set up on this server yet.`);

  const budgetKes = Math.round(Number(body.budgetKes));
  if (!Number.isFinite(budgetKes) || budgetKes < settings.minBudgetKes) {
    return fail(400, `The minimum budget is KES ${settings.minBudgetKes.toLocaleString()}.`);
  }
  if (budgetKes > settings.maxBudgetKes) {
    return fail(400, `The maximum budget is KES ${settings.maxBudgetKes.toLocaleString()}.`);
  }
  const durationDays = Math.round(Number(body.durationDays));
  if (!Number.isFinite(durationDays) || durationDays < LIMITS.minDays || durationDays > LIMITS.maxDays) {
    return fail(400, `Run the ad for ${LIMITS.minDays}–${LIMITS.maxDays} days.`);
  }

  // Split the budget evenly; the last network takes any rounding difference.
  const share = Math.floor(budgetKes / platforms.length);
  const runs: AdPlatformRun[] = platforms.map((platform, i) => ({
    platform,
    budgetKes: i === platforms.length - 1 ? budgetKes - share * (platforms.length - 1) : share,
    status: "pending",
  }));

  const link = landingUrl(origin, project.slug);
  if (!isPublicUrl(link)) {
    return fail(
      400,
      "Ads need to link to the live website. Set PUBLIC_SITE_URL in .env to the site's public https address (for example https://mtajisiasa.co.ke)."
    );
  }

  const now = new Date().toISOString();
  const campaign: AdCampaign = {
    id: createId("ad"),
    leaderId: session.leaderId,
    createdBy: session.userId,
    projectId: project.id,
    name: (asString(body.name) ?? `${project.name} — ad`).slice(0, 120),
    headline,
    body: text,
    imageUrl: project.image,
    landingUrl: link,
    keywords,
    platforms: runs,
    budgetKes,
    durationDays,
    estimatedReach: Math.round(budgetKes * settings.reachPerKes),
    kesPerUsd: settings.kesPerUsd,
    status: settings.requireApproval ? "pending_approval" : "launching",
    statusNote: settings.requireApproval ? "Waiting for an admin to approve before it goes live." : undefined,
    refundedKes: 0,
    createdAt: now,
    updatedAt: now,
  };

  const charge = await chargeWallet(session.leaderId, budgetKes, `Ad: ${campaign.name}`, campaign.id);
  if (!charge.ok) return fail(402, charge.error);

  let saved = await save(campaign);
  if (!settings.requireApproval) saved = await launch(saved);
  return ok({ ok: true, item: saved, walletBalance: await walletBalance(session.leaderId) }, 201);
}

/** Demo launch: every chosen network "goes live" without contacting it. */
async function launch(campaign: AdCampaign): Promise<AdCampaign> {
  const start = new Date(Date.now() + 10 * 60_000);
  const end = new Date(start.getTime() + campaign.durationDays * 86_400_000);
  return save({
    ...campaign,
    platforms: campaign.platforms.map((run) => ({ ...run, status: "live", error: undefined })),
    status: "active",
    statusNote: "Demo: simulated launch. Nothing was sent to the ad networks (memory store).",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  });
}

function setStatus(campaign: AdCampaign, active: boolean): AdCampaign {
  return {
    ...campaign,
    platforms: campaign.platforms.map((run) =>
      run.status === "live" || run.status === "paused" ? { ...run, status: active ? "live" : "paused", error: undefined } : run
    ),
  };
}

/** Demo results: nothing is measured, so only the end date is checked. */
async function sync(campaign: AdCampaign): Promise<AdCampaign> {
  const next = { ...campaign, platforms: campaign.platforms.map((run) => ({ ...run, syncedAt: new Date().toISOString() })) };
  if (next.status === "active" && next.endDate && Date.parse(next.endDate) < Date.now()) {
    return finish(next, "completed", "Finished. Any unspent budget was returned to your wallet.");
  }
  return next;
}

/** End the campaign and refund what the networks did not spend. */
async function finish(
  campaign: AdCampaign,
  status: "completed" | "stopped",
  note: string
): Promise<AdCampaign> {
  const spent = campaign.platforms.reduce((sum, r) => sum + (r.status === "failed" ? 0 : r.spentKes ?? 0), 0);
  const paidToNetworks = campaign.platforms.reduce((sum, r) => sum + (r.status === "failed" ? 0 : r.budgetKes), 0);
  const unspent = round2(Math.max(0, paidToNetworks - spent));
  if (unspent > 0) await refundWallet(campaign.leaderId, unspent, `Unspent budget: "${campaign.name}"`, campaign.id);
  return {
    ...campaign,
    status,
    statusNote: note,
    platforms: campaign.platforms.map((r) => (r.status === "failed" ? r : { ...r, status: "ended" })),
    refundedKes: round2(campaign.refundedKes + unspent),
  };
}

export type AdAction = "approve" | "reject" | "pause" | "resume" | "stop" | "sync";

export async function actOnAdCampaign(
  session: AuthSession,
  id: string,
  action: AdAction,
  note?: string
): Promise<ContentResult> {
  const campaign = await repo().find(id);
  if (!campaign) return fail(404, "Campaign not found.");
  if (!canManage(session, campaign)) return fail(403, "You can only manage your own campaigns.");

  let next: AdCampaign;
  switch (action) {
    case "approve":
      if (session.role !== "admin") return fail(403, "Only an admin can approve ads.");
      if (campaign.status !== "pending_approval") return fail(400, "This ad is not waiting for approval.");
      next = await launch(campaign);
      break;
    case "reject":
      if (campaign.status !== "pending_approval") return fail(400, "Only ads waiting for approval can be rejected or cancelled.");
      if (session.role !== "admin" && campaign.leaderId !== session.leaderId) return fail(403, "Not allowed.");
      await refundWallet(campaign.leaderId, campaign.budgetKes, `Refund: "${campaign.name}" was not published`, campaign.id);
      next = await save({
        ...campaign,
        status: "rejected",
        statusNote:
          session.role === "admin"
            ? `Not approved${note ? `: ${note}` : "."} The full budget was refunded.`
            : "Cancelled before publishing. The full budget was refunded.",
        refundedKes: campaign.budgetKes,
      });
      break;
    case "pause":
      if (campaign.status !== "active") return fail(400, "Only a running ad can be paused.");
      next = setStatus(campaign, false);
      next = { ...next, status: "paused", statusNote: "Paused. Resume any time before the end date." };
      break;
    case "resume":
      if (campaign.status !== "paused") return fail(400, "Only a paused ad can be resumed.");
      next = setStatus(campaign, true);
      next = { ...next, status: "active", statusNote: "Running again." };
      break;
    case "stop":
      if (campaign.status !== "active" && campaign.status !== "paused") return fail(400, "This ad is not running.");
      next = await sync(setStatus(campaign, false));
      if (next.status === "active" || next.status === "paused") {
        next = await finish(next, "stopped", "Stopped early. The unspent budget was returned to your wallet.");
      }
      break;
    case "sync":
      if (campaign.status !== "active" && campaign.status !== "paused") return ok({ ok: true, item: campaign });
      next = await sync(campaign);
      break;
    default:
      return fail(400, "Unknown action.");
  }
  const saved = action === "reject" ? next : await save(next);
  return ok({ ok: true, item: saved, walletBalance: await walletBalance(saved.leaderId) });
}

export function asAction(value: unknown): AdAction | null {
  return ["approve", "reject", "pause", "resume", "stop", "sync"].includes(value as string)
    ? (value as AdAction)
    : null;
}
