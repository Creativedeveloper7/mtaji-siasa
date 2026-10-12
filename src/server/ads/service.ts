import type { AdCampaign, AdPlatform, AdPlatformRun } from "@/types";
import type { AuthSession } from "@/types/auth";
import { createId } from "@/lib/store";
import { getRepositories } from "@/server";
import { asString, isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";
import { adSettings, platformConfigured } from "@/server/ads/config";
import { prepareAdImages } from "@/server/ads/images";
import { googleStats, launchGoogle, setGoogleStatus } from "@/server/ads/google";
import { checkX, launchX, setXStatus, xStats } from "@/server/ads/x";
import { chargeWallet, refundWallet, walletBalance } from "@/server/wallet/service";

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

function save(campaign: AdCampaign): AdCampaign {
  return repo().upsert({ ...campaign, updatedAt: new Date().toISOString() });
}

export function listAdCampaigns(session: AuthSession, scope: "mine" | "all"): ContentResult {
  const all = repo().list();
  if (scope === "all") {
    if (session.role !== "admin") return fail(403, "Only an admin can see every campaign.");
    return ok({ ok: true, items: all, quote: adQuote() });
  }
  if (!session.leaderId) return fail(403, "Your account is not linked to a leader profile.");
  return ok({
    ok: true,
    items: all.filter((item) => item.leaderId === session.leaderId),
    quote: adQuote(),
    walletBalance: walletBalance(session.leaderId),
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

  const project = getRepositories().content.findProject(asString(body.projectId) ?? "");
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

  const charge = chargeWallet(session.leaderId, budgetKes, `Ad: ${campaign.name}`, campaign.id);
  if (!charge.ok) return fail(402, charge.error);

  let saved = save(campaign);
  if (!settings.requireApproval) saved = await launch(saved);
  return ok({ ok: true, item: saved, walletBalance: walletBalance(session.leaderId) }, 201);
}

/** Publish on each chosen network. Failed networks are refunded; if all fail the campaign fails. */
async function launch(campaign: AdCampaign): Promise<AdCampaign> {
  let current = save({ ...campaign, status: "launching", statusNote: "Publishing to the ad networks…" });
  const project = getRepositories().content.findProject(current.projectId);
  const leader = getRepositories().content.findLeader(current.leaderId);
  const start = new Date(Date.now() + 10 * 60_000);
  const end = new Date(start.getTime() + current.durationDays * 86_400_000);

  let images: Awaited<ReturnType<typeof prepareAdImages>> | null = null;
  let imageError = "";
  try {
    images = await prepareAdImages(current.imageUrl);
  } catch (error) {
    imageError = error instanceof Error ? error.message : "Could not prepare the image.";
  }

  const dryRun = adSettings().dryRun;
  const runs: AdPlatformRun[] = [];
  for (const run of current.platforms) {
    const usd = run.budgetKes / current.kesPerUsd;
    try {
      if (!images) throw new Error(imageError);
      const externalIds =
        run.platform === "x" && dryRun
          ? await checkX()
          : run.platform === "x"
          ? await launchX({
              name: current.name,
              text: `${current.headline}\n\n${current.body}\n${current.landingUrl}`.slice(0, 280),
              image: images.landscape,
              keywords: current.keywords,
              totalUsd: usd,
              days: current.durationDays,
              start,
              end,
            })
          : await launchGoogle({
              name: current.name,
              headline: current.headline.slice(0, 30),
              longHeadline: (project?.name ?? current.headline).slice(0, 90),
              description: current.body.slice(0, 90),
              businessName: (leader ? `${leader.honorific} ${leader.name}` : "M-Taji Siasa").slice(0, 25),
              finalUrl: current.landingUrl,
              keywords: current.keywords,
              landscape: images.landscape,
              square: images.square,
              totalUsd: usd,
              days: current.durationDays,
              start,
              end,
              validateOnly: dryRun,
            });
      runs.push({ ...run, status: "live", externalIds, error: undefined });
    } catch (error) {
      runs.push({ ...run, status: "failed", error: error instanceof Error ? error.message : "Launch failed." });
    }
  }

  const failed = runs.filter((r) => r.status === "failed");
  const refund = failed.reduce((sum, r) => sum + r.budgetKes, 0);
  if (refund > 0) {
    refundWallet(
      current.leaderId,
      refund,
      `Refund: ${failed.map((r) => (r.platform === "x" ? "X" : "Google")).join(" and ")} could not run "${current.name}"`,
      current.id
    );
  }
  const live = runs.some((r) => r.status === "live");
  current = save({
    ...current,
    platforms: runs,
    status: live ? "active" : "failed",
    statusNote: live
      ? failed.length
        ? `Live on ${runs.filter((r) => r.status === "live").map((r) => (r.platform === "x" ? "X" : "Google")).join(" and ")}. ${failed.length === 1 ? "One network" : "Some networks"} failed and ${refund.toLocaleString()} KES was refunded.`
        : dryRun
          ? "Dry run: checked on the networks, nothing was published (ADS_DRY_RUN=true)."
          : "Live. The networks review new ads before they start showing."
      : "No network accepted the ad. The full budget was refunded to your wallet.",
    startDate: live ? start.toISOString() : undefined,
    endDate: live ? end.toISOString() : undefined,
    refundedKes: round2(current.refundedKes + refund),
  });
  return current;
}

async function setStatus(campaign: AdCampaign, active: boolean): Promise<AdCampaign> {
  const runs: AdPlatformRun[] = [];
  for (const run of campaign.platforms) {
    if (run.status !== "live" && run.status !== "paused") {
      runs.push(run);
      continue;
    }
    try {
      if (run.platform === "x") await setXStatus(run.externalIds ?? {}, active);
      else await setGoogleStatus(run.externalIds ?? {}, active);
      runs.push({ ...run, status: active ? "live" : "paused", error: undefined });
    } catch (error) {
      runs.push({ ...run, error: error instanceof Error ? error.message : "Could not update the network." });
    }
  }
  return { ...campaign, platforms: runs };
}

/** Pull impressions, clicks and spend from each network. */
async function sync(campaign: AdCampaign): Promise<AdCampaign> {
  const runs: AdPlatformRun[] = [];
  for (const run of campaign.platforms) {
    if (!run.externalIds || run.status === "failed") {
      runs.push(run);
      continue;
    }
    try {
      const stats =
        run.platform === "x"
          ? await xStats(run.externalIds, new Date(campaign.startDate ?? campaign.createdAt))
          : await googleStats(run.externalIds);
      runs.push({
        ...run,
        impressions: stats.impressions,
        clicks: stats.clicks,
        spentKes: round2(Math.min(run.budgetKes, stats.spentUsd * campaign.kesPerUsd)),
        syncedAt: new Date().toISOString(),
        error: undefined,
      });
    } catch (error) {
      runs.push({ ...run, error: error instanceof Error ? error.message : "Could not read results." });
    }
  }
  let next: AdCampaign = { ...campaign, platforms: runs };
  if (next.status === "active" && next.endDate && Date.parse(next.endDate) < Date.now()) {
    next = finish(next, "completed", "Finished. Any unspent budget was returned to your wallet.");
  }
  return next;
}

/** End the campaign and refund what the networks did not spend. */
function finish(campaign: AdCampaign, status: "completed" | "stopped", note: string): AdCampaign {
  const spent = campaign.platforms.reduce((sum, r) => sum + (r.status === "failed" ? 0 : r.spentKes ?? 0), 0);
  const paidToNetworks = campaign.platforms.reduce((sum, r) => sum + (r.status === "failed" ? 0 : r.budgetKes), 0);
  const unspent = round2(Math.max(0, paidToNetworks - spent));
  if (unspent > 0) refundWallet(campaign.leaderId, unspent, `Unspent budget: "${campaign.name}"`, campaign.id);
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
  const campaign = repo().find(id);
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
      refundWallet(campaign.leaderId, campaign.budgetKes, `Refund: "${campaign.name}" was not published`, campaign.id);
      next = save({
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
      next = await setStatus(campaign, false);
      next = { ...next, status: "paused", statusNote: "Paused. Resume any time before the end date." };
      break;
    case "resume":
      if (campaign.status !== "paused") return fail(400, "Only a paused ad can be resumed.");
      next = await setStatus(campaign, true);
      next = { ...next, status: "active", statusNote: "Running again." };
      break;
    case "stop":
      if (campaign.status !== "active" && campaign.status !== "paused") return fail(400, "This ad is not running.");
      next = await sync(await setStatus(campaign, false));
      if (next.status === "active" || next.status === "paused") {
        next = finish(next, "stopped", "Stopped early. The unspent budget was returned to your wallet.");
      }
      break;
    case "sync":
      if (campaign.status !== "active" && campaign.status !== "paused") return ok({ ok: true, item: campaign });
      next = await sync(campaign);
      break;
    default:
      return fail(400, "Unknown action.");
  }
  const saved = action === "reject" ? next : save(next);
  return ok({ ok: true, item: saved, walletBalance: walletBalance(saved.leaderId) });
}

/** Admin check: build a full Google campaign in validate-only mode (nothing is created). */
export async function validateGoogleSetup(imageUrl: string): Promise<ContentResult> {
  try {
    const images = await prepareAdImages(imageUrl);
    const start = new Date(Date.now() + 86_400_000);
    await launchGoogle({
      name: "M-Taji validation",
      headline: "Validation headline",
      longHeadline: "Validation long headline for M-Taji Siasa",
      description: "Validation description.",
      businessName: "M-Taji Siasa",
      finalUrl: `${adSettings().siteUrl || "https://example.com"}/projects/validation`,
      keywords: ["nairobi roads"],
      landscape: images.landscape,
      square: images.square,
      totalUsd: 5,
      days: 1,
      start,
      end: new Date(start.getTime() + 86_400_000),
      validateOnly: true,
    });
    return ok({ ok: true, google: "valid" });
  } catch (error) {
    return fail(502, error instanceof Error ? error.message : "Validation failed.");
  }
}

export function asAction(value: unknown): AdAction | null {
  return ["approve", "reject", "pause", "resume", "stop", "sync"].includes(value as string)
    ? (value as AdAction)
    : null;
}
