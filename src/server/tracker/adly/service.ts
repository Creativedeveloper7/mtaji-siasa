import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdCampaign, AdPlatform } from "@/types";
import type { AuthSession } from "@/types/auth";
import type { AdCreative, AdlyContent, AdlyInsight, Campaign, PolicyReview } from "@/types/adly";
import { computeAdlyStats } from "@/data/adly";
import { getRepositories } from "@/server";
import { visibleAdly } from "@/server/adly/service";
import { parseCampaign, parseCreative as parseSiasaCreative, parsePolicyReview } from "@/server/adly/parse";
import { asString, isRecord } from "@/server/content/parse";
import { chosenAdImage, xPolicyError } from "@/server/ads/x-review";
import type { ContentActor, ContentResult } from "@/server/content/service";
import { serviceClient } from "@/server/tracker/clients";
import { AD_LIMITS, trackerAdSettings } from "@/server/tracker/adly/config";
import { callEdge, EdgeError, edgeErrorMessage } from "@/server/tracker/adly/edge";
import { AdlyError, PUBLISHING_MESSAGE } from "@/server/tracker/adly/errors";
import {
  adComposerToRow,
  campaignIdFromCreativeId,
  campaignToRow,
  channelLabel,
  creativeToRow,
  hasProviderCampaign,
  insightErrorsToInsights,
  isClaimActive,
  isPaidAdsRow,
  isPublishedTo,
  providerCampaignChannels,
  readSiasaMeta,
  recommendationToInsight,
  rowToAdCampaign,
  rowToCampaign,
  rowToCreative,
  withSiasaMeta,
  type SiasaMeta,
  type SiasaPublishClaim,
  type SiasaReview,
  type SiasaUnpaid,
} from "@/server/tracker/adly/mapping";
import {
  PUBLISH_FUNCTION,
  buildGooglePublishPayload,
  buildXPublishPayload,
  normalizePlan,
  obj,
  parseCreative,
  resolvePublishChannels,
  splitBudgetAcrossChannels,
} from "@/server/tracker/adly/plan";
import * as repo from "@/server/tracker/adly/repository";
import type { AdlyCampaignRow, ChannelPublishResult, TrackerChannel } from "@/server/tracker/adly/rows";
import {
  debitWalletForAdSpend,
  debitWalletForAdSpendUpdate,
  signedInWalletUser,
  trackerAvailableBalance,
} from "@/server/tracker/wallet/service";

/**
 * Adly and paid ads on the Tracker backend.
 *
 *  - Campaigns are adly_campaigns rows owned by the signed-in user (RLS).
 *  - Chat, publish and insight sync are the Tracker edge functions, called
 *    with the user's access token.
 *  - The wallet is debited per network after the network accepts the ad,
 *    exactly as the Tracker frontend does.
 */

type Ok = Extract<ContentResult, { ok: true }>;

function fail(status: number, error: string): ContentResult {
  return { ok: false, status, error };
}

function ok(body: Record<string, unknown>, status = 200): Ok {
  return { ok: true, status, body };
}

/** The signed-in user as the wallet module knows it. */
type WalletUser = Parameters<typeof debitWalletForAdSpend>[0];
type AdSpendProvider = Parameters<typeof debitWalletForAdSpend>[1]["provider"];

export interface SignedIn {
  client: SupabaseClient;
  /** auth user id, confirmed with auth.getUser() */
  userId: string;
  token: string;
  wallet: WalletUser;
}

/**
 * The signed-in Tracker user, confirmed with auth.getUser(). When the Siasa
 * session's user id is given it must match (ownership is by auth user id).
 */
async function signedIn(expectedUserId?: string): Promise<SignedIn> {
  const res = await signedInWalletUser(expectedUserId);
  if (!res.ok) throw new AdlyError(res.error, res.status);
  return { client: res.data.client, userId: res.data.userId, token: res.data.accessToken, wallet: res.data };
}

/** Balance minus pending withdrawals (the wallet module's rule). */
async function availableBalance(user: SignedIn): Promise<number> {
  const res = await trackerAvailableBalance(user.wallet);
  if (!res.ok) throw new AdlyError(res.error, res.status);
  return res.data;
}

async function balanceForDisplay(user: SignedIn): Promise<number | undefined> {
  const res = await trackerAvailableBalance(user.wallet).catch(() => null);
  return res?.ok ? res.data : undefined;
}

/**
 * Run a service body; turn thrown errors into a ContentResult. Only AdlyError
 * / EdgeError messages (written for users) reach the client; anything else is
 * logged and answered generically.
 */
async function guard(run: () => Promise<ContentResult>): Promise<ContentResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AdlyError || error instanceof EdgeError) return fail(error.status, error.message);
    console.error("[adly] unexpected error:", error);
    return fail(500, "Something went wrong. Try again.");
  }
}

const EDITOR_ROLES = ["leader", "aspirant", "admin"] as const;

function isEditorRole(role: string): boolean {
  return (EDITOR_ROLES as readonly string[]).includes(role);
}

/**
 * Swap the first X image for a version in a shape X's image cards accept
 * (see x-card-image.ts). Best effort: on failure the original goes, and the
 * publish function falls back to an image + link post.
 */
async function withXCardImage<T extends { image_paths: string[] }>(client: SupabaseClient, payload: T): Promise<T> {
  const [first, ...rest] = payload.image_paths;
  if (!first) return payload;
  try {
    return { ...payload, image_paths: [await repo.xCardImagePath(client, first), ...rest] };
  } catch (error) {
    console.warn("[adly] X image not cropped:", first, error instanceof Error ? error.message : error);
    return payload;
  }
}

function siteOrigin(requestOrigin?: string): string | undefined {
  return trackerAdSettings().siteUrl || requestOrigin;
}

// ===========================================================================
// Publishing (shared by paid ads and the Adly workspace)

export interface PublishOutcome {
  ok: boolean;
  results: ChannelPublishResult[];
  row: AdlyCampaignRow | null;
  /** Networks that accepted the ad but whose wallet debit failed in this publish */
  unpaid: SiasaUnpaid[];
}

const ACCEPTED = ["submitted", "success", "live"];

function providerName(provider: string): string {
  return channelLabel(provider);
}

function isWalletProvider(provider: TrackerChannel): provider is TrackerChannel & AdSpendProvider {
  return provider === "google" || provider === "meta" || provider === "tiktok" || provider === "x";
}

type DebitOutcome = { ok: true; deltaKes: number } | { ok: false; error: string };

/**
 * First debit on a network. The RPC is idempotent per (campaign, provider):
 * when it hands back a transaction that already existed, nothing new was
 * charged, so deltaKes is 0.
 */
async function debitFirst(
  user: SignedIn,
  campaignId: string,
  provider: TrackerChannel,
  amountKes: number,
  existingTxIds: Set<string>
): Promise<DebitOutcome> {
  if (!isWalletProvider(provider)) return { ok: false, error: "That ad network is not supported for wallet payments." };
  const res = await debitWalletForAdSpend(user.wallet, { campaignId, provider, amountKes });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, deltaKes: existingTxIds.has(String(res.data.transactionId)) ? 0 : amountKes };
}

async function debitUpdate(user: SignedIn, campaignId: string, provider: TrackerChannel, newTotalKes: number): Promise<DebitOutcome> {
  if (!isWalletProvider(provider)) return { ok: false, error: "That ad network is not supported for wallet payments." };
  const res = await debitWalletForAdSpendUpdate(user.wallet, { campaignId, provider, newTotalKes });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, deltaKes: res.data.deltaKes };
}

/**
 * Take the campaign's publish claim (metadata.siasa.publishing). The write is
 * conditional on the updated_at we read, so of two concurrent publishes only
 * one gets it; the other answers 409. A claim older than PUBLISH_CLAIM_TTL_MS
 * is treated as abandoned and may be taken over.
 */
export async function claimPublish(
  user: Pick<SignedIn, "client" | "userId">,
  row: AdlyCampaignRow,
  now = new Date()
): Promise<{ row: AdlyCampaignRow; claim: SiasaPublishClaim }> {
  if (isClaimActive(readSiasaMeta(row.metadata).publishing, now)) throw new AdlyError(PUBLISHING_MESSAGE, 409);
  const claim: SiasaPublishClaim = { at: now.toISOString(), by: user.userId };
  const claimed = await repo.updateCampaign(
    user.client,
    row,
    { metadata: withSiasaMeta(row.metadata, { publishing: claim }) },
    PUBLISHING_MESSAGE
  );
  return { row: claimed, claim };
}

/**
 * Release our claim and record unpaid networks, on the freshest row (the
 * publish functions have written provider ids meanwhile). Retries a few times
 * on a concurrent write; never throws.
 */
async function releasePublish(
  user: Pick<SignedIn, "client">,
  campaignId: string,
  claim: SiasaPublishClaim,
  unpaid: SiasaUnpaid[]
): Promise<void> {
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const fresh = await repo.findCampaign(user.client, campaignId);
      if (!fresh) return;
      const siasa = readSiasaMeta(fresh.metadata);
      const ours = siasa.publishing?.at === claim.at && siasa.publishing?.by === claim.by;
      if (!ours && !unpaid.length) return;
      const patch: Partial<SiasaMeta> = {};
      if (ours) patch.publishing = undefined;
      if (unpaid.length) patch.unpaid = [...(siasa.unpaid ?? []), ...unpaid];
      try {
        await repo.updateCampaign(user.client, fresh, { metadata: withSiasaMeta(fresh.metadata, patch) });
        return;
      } catch (error) {
        if (error instanceof AdlyError && error.status === 409) continue;
        throw error;
      }
    }
    throw new Error("still changing after retries");
  } catch (error) {
    // The claim expires on its own after PUBLISH_CLAIM_TTL_MS; unpaid entries are also in the response and this log.
    console.error("[adly] could not release the publish claim / record unpaid debits:", campaignId, error, JSON.stringify(unpaid));
  }
}

/**
 * Publish the campaign plan to each selected live network (Google, X), the way
 * the Tracker's adsRepository.publishCampaignPlan does:
 *  0. claim the campaign (one publish at a time),
 *  1. split the client budget across the networks,
 *  2. check the available wallet balance covers each share (only the increase on a republish),
 *  3. call the network's edge function with the user's token,
 *  4. debit the wallet only when the network accepted it (submitted / updated);
 *     a failed debit after acceptance is recorded in metadata.siasa.unpaid,
 *  5. pull insights once at the end, then release the claim.
 * Every publish entry point (publish route, campaign action, composer) goes through here.
 */
export async function publishPlan(
  user: SignedIn,
  row: AdlyCampaignRow,
  options: { origin?: string; only?: TrackerChannel; now?: Date } = {}
): Promise<PublishOutcome> {
  const selected = resolvePublishChannels(row.channels);
  const channels = options.only ? selected.filter((c) => c === options.only) : selected;
  if (!channels.length) {
    return {
      ok: false,
      row,
      unpaid: [],
      results: [{ provider: options.only ?? "google", ok: false, error: "Choose Google or X before publishing." }],
    };
  }
  const plan = normalizePlan(row);
  if (plan.budgetKes <= 0) {
    return {
      ok: false,
      row,
      unpaid: [],
      results: channels.map((provider) => ({ provider, ok: false, error: "Set a budget before publishing." })),
    };
  }

  const { row: claimed, claim } = await claimPublish(user, row, options.now);
  const shares = splitBudgetAcrossChannels(plan.budgetKes, selected);
  const settings = trackerAdSettings();
  const origin = siteOrigin(options.origin);
  const results: ChannelPublishResult[] = [];
  const unpaid: SiasaUnpaid[] = [];

  try {
    for (const provider of channels) {
      const shareKes = shares[provider] ?? plan.budgetKes;
      const republish = isPublishedTo(claimed, provider);
      try {
        // Wallet gate before any network call: a live ad must be fundable.
        const debits = await repo.adSpendDebits(user.client, row.id, provider);
        const required = Math.max(0, shareKes - debits.totalKes);
        if (required > 0) {
          const available = await availableBalance(user);
          if (available < required) {
            results.push({
              provider,
              ok: false,
              status: "failed",
              error: `Insufficient wallet balance (KES ${available.toLocaleString()} available, need KES ${required.toLocaleString()}). Top up your wallet first.`,
            });
            continue;
          }
        }

        const payload =
          provider === "google"
            ? buildGooglePublishPayload(claimed, shareKes, origin)
            : await withXCardImage(user.client, buildXPublishPayload(claimed, shareKes, origin));
        const res = await callEdge(PUBLISH_FUNCTION[provider], user.token, { ...payload, dry_run: settings.dryRun });
        const status = typeof res.json.status === "string" ? res.json.status : undefined;
        if (!res.ok || status === "failed") {
          results.push({
            provider,
            ok: false,
            status: "failed",
            error: edgeErrorMessage(res, `${providerName(provider)} did not accept the ad`, `${PUBLISH_FUNCTION[provider]} ${row.id}`),
          });
          continue;
        }

        let walletWarning: string | undefined;
        let debit: DebitOutcome | null = null;
        if (status && ACCEPTED.includes(status) && !republish) {
          debit = await debitFirst(user, row.id, provider, shareKes, debits.ids);
        } else if (status === "updated" || (status && ACCEPTED.includes(status) && republish)) {
          // Gross share, the same basis as the first debit (the Tracker UI uses total_budget_kes).
          debit = await debitUpdate(user, row.id, provider, shareKes);
          if (debit.ok && debit.deltaKes > 0) walletWarning = `KES ${debit.deltaKes.toLocaleString()} more reserved for the budget increase.`;
        }
        if (debit && !debit.ok) {
          const amountKes = required > 0 ? required : shareKes;
          console.error("[adly] wallet debit failed after the network accepted the ad:", row.id, provider, amountKes, debit.error);
          unpaid.push({ provider, amountKes, at: new Date().toISOString(), error: debit.error });
          walletWarning = `Unpaid: ${providerName(provider)} accepted the ad but your wallet was not charged (${debit.error.replace(/[.\s]+$/, "")}). It is marked unpaid; top up and an admin will settle it.`;
        }
        results.push({
          provider,
          ok: true,
          status,
          message: typeof res.json.message === "string" ? res.json.message : undefined,
          walletWarning,
        });
      } catch (error) {
        const safe = error instanceof AdlyError || error instanceof EdgeError;
        if (!safe) console.error("[adly] publish failed:", row.id, provider, error);
        results.push({ provider, ok: false, error: safe ? (error as Error).message : "Publish failed. Try again." });
      }
    }

    if (results.some((r) => r.ok && r.status !== "dry_run")) {
      await callEdge("sync-ad-insights", user.token, { campaign_id: row.id }, 45_000).catch(() => null);
    }
  } finally {
    await releasePublish(user, row.id, claim, unpaid);
  }
  const fresh = await repo.findCampaign(user.client, row.id);
  return { ok: results.length > 0 && results.every((r) => r.ok), results, row: fresh, unpaid };
}

/** Warnings to return with a publish: one per network that is live but unpaid. */
function publishWarnings(outcome: PublishOutcome): string[] {
  return outcome.unpaid.map(
    (u) =>
      `${providerName(u.provider)} accepted the ad but KES ${u.amountKes.toLocaleString()} could not be charged to your wallet. It is marked unpaid.`
  );
}

export function summarizePublish(results: ChannelPublishResult[]): string {
  return results
    .map((r) => {
      const name = r.provider === "x" ? "X" : r.provider.charAt(0).toUpperCase() + r.provider.slice(1);
      if (!r.ok) return `${name}: ${r.error || "failed"}`;
      const extra = r.walletWarning ? ` Wallet: ${r.walletWarning}` : "";
      if (r.status === "dry_run") return `${name}: dry run, not live. ${r.message ?? ""}`.trim() + extra;
      if (r.status === "updated") return `${name}: updated.${extra}`;
      return `${name}: ${r.message || "submitted live."}${extra}`;
    })
    .join(" · ");
}

/** sync-ad-insights for one campaign, then the stored stats. */
export async function syncInsights(user: SignedIn, campaignId: string) {
  const res = await callEdge("sync-ad-insights", user.token, { campaign_id: campaignId }, 45_000);
  const rawErrors = Array.isArray(res.json.errors) ? (res.json.errors as { provider?: unknown; error?: unknown }[]) : [];
  if (rawErrors.length) console.error("[adly] sync-ad-insights provider errors:", campaignId, JSON.stringify(rawErrors));
  // Provider text stays in the server log; the client gets which network failed.
  const errors = rawErrors
    .filter((e) => typeof e?.provider === "string")
    .map((e) => ({ provider: String(e.provider), error: `Could not refresh results from ${providerName(String(e.provider))}.` }));
  const stats = (await repo.listStats(user.client, [campaignId])).get(campaignId) ?? [];
  return {
    live: res.ok,
    message: res.ok ? undefined : edgeErrorMessage(res, "Results could not be refreshed", `sync-ad-insights ${campaignId}`),
    errors,
    stats,
  };
}

/**
 * Why this campaign cannot be published yet, or null. With
 * ADS_REQUIRE_APPROVAL on, publishing needs review.state === "approved" —
 * whatever the row status says. The one exception is a campaign published from
 * the Tracker (no Siasa review) whose every selected network already has a
 * provider campaign id: that publish updates the campaign in place. Edits
 * after approval reset the review to pending (applyEditReview), so they need a
 * new approval.
 */
export function approvalBlocks(row: AdlyCampaignRow, channels: TrackerChannel[] = resolvePublishChannels(row.channels)): string | null {
  if (!trackerAdSettings().requireApproval) return null;
  const review = readSiasaMeta(row.metadata).review;
  if (review?.state === "approved") return null;
  if (review?.state === "rejected" || review?.state === "cancelled") return "This ad was not approved.";
  if (!review && channels.length > 0 && channels.every((c) => isPublishedTo(row, c))) return null;
  if (review?.state === "pending" && hasProviderCampaign(row)) {
    return "Your changes have to be approved by an admin before they can be republished.";
  }
  return "An admin has to approve this ad before it can be published.";
}

/** Admins may look at any campaign but only the owner edits or publishes it. */
/** Adly's X policy guard for publishing an existing campaign (see xPolicyError). */
async function xPolicyBlock(row: AdlyCampaignRow, channels: TrackerChannel[]): Promise<string | null> {
  if (!channels.includes("x")) return null;
  const ad = rowToAdCampaign(row);
  if (!ad.headline && !ad.body) return null;
  const project = ad.projectId ? await getRepositories().content.findProject(ad.projectId) : undefined;
  return xPolicyError(project, { headline: ad.headline, body: ad.body, keywords: ad.keywords }, ad.name);
}

async function notOwned(session: { role: string }, id: string, verb: string): Promise<ContentResult> {
  if (session.role === "admin" && repo.isUuid(id)) {
    const other = await repo.findCampaign(serviceClient(), id);
    if (other) return fail(403, `Admins can review but not ${verb} others' campaigns.`);
  }
  return fail(404, "Campaign not found.");
}

/** POST /api/ads/publish/[id]: owner publishes (or republishes) a campaign. */
export async function publishCampaign(
  session: AuthSession,
  id: string,
  body: unknown,
  requestOrigin?: string
): Promise<ContentResult> {
  if (!isEditorRole(session.role)) return fail(403, "Only leaders, aspirants and admins can publish ads.");
  return guard(async () => {
    const user = await signedIn(session.userId);
    const row = await repo.findCampaign(user.client, id);
    if (!row) return notOwned(session, id, "publish");
    const only = isRecord(body) && (body.channel === "google" || body.channel === "x") ? body.channel : undefined;
    const channels = resolvePublishChannels(row.channels).filter((c) => !only || c === only);
    const blocked = approvalBlocks(row, channels);
    if (blocked) return fail(409, blocked);
    const policy = await xPolicyBlock(row, channels);
    if (policy) return fail(422, policy);
    const outcome = await publishPlan(user, row, { origin: requestOrigin, only });
    const current = outcome.row ?? row;
    const stats = (await repo.listStats(user.client, [current.id])).get(current.id) ?? [];
    return ok(
      {
        ok: outcome.ok,
        results: outcome.results,
        summary: summarizePublish(outcome.results),
        warnings: publishWarnings(outcome),
        item: rowToAdCampaign(current, { stats, fallbackLeaderId: session.leaderId, reachPerKes: trackerAdSettings().reachPerKes }),
        campaign: rowToCampaign(current, { stats, fallbackLeaderId: session.leaderId }),
        walletBalance: await balanceForDisplay(user),
      },
      outcome.ok ? 200 : 207
    );
  });
}

// ===========================================================================
// Paid ads (dashboard composer + admin)

export function trackerAdQuote() {
  const s = trackerAdSettings();
  return {
    kesPerUsd: 134,
    reachPerKes: s.reachPerKes,
    minBudgetKes: s.minBudgetKes,
    maxBudgetKes: s.maxBudgetKes,
    requireApproval: s.requireApproval,
    limits: AD_LIMITS,
    // Network setup lives in Supabase secrets; an unset network answers "dry_run".
    platforms: (["x", "google"] as AdPlatform[]).map((platform) => ({ platform, configured: true })),
    backend: "tracker" as const,
    /** The wallet is charged per network when it accepts the ad, not when the ad is created. */
    chargeOn: "publish" as const,
    /** Pause / resume / stop have no Tracker edge function yet. */
    controls: { pause: false, resume: false, stop: false },
  };
}

export async function listTrackerAds(session: AuthSession, scope: "mine" | "all"): Promise<ContentResult> {
  return guard(async () => {
    const settings = trackerAdSettings();
    if (scope === "all") {
      if (session.role !== "admin") return fail(403, "Only an admin can see every campaign.");
      const service = serviceClient();
      const rows = (await repo.adminListCampaigns(service)).filter(isPaidAdsRow);
      const [stats, leaders, thumbs, audits] = await Promise.all([
        repo.listStats(service, rows.map((r) => r.id)),
        repo.leaderIdsForUsers(service, rows.map((r) => r.user_id)),
        repo.thumbnailUrls(service, rows),
        repo.latestAudits(service, rows.map((r) => r.id)),
      ]);
      const items = rows.map((row) =>
        rowToAdCampaign(row, {
          stats: stats.get(row.id),
          audits: audits.get(row.id),
          fallbackLeaderId: leaders.get(row.user_id),
          imageUrl: thumbs.get(row.id),
          reachPerKes: settings.reachPerKes,
        })
      );
      return ok({ ok: true, items, quote: trackerAdQuote() });
    }
    if (!session.leaderId) return fail(403, "Your account is not linked to a leader profile.");
    const user = await signedIn(session.userId);
    const rows = (await repo.listOwnCampaigns(user.client, user.userId)).filter(isPaidAdsRow);
    const [stats, thumbs, balance, audits] = await Promise.all([
      repo.listStats(user.client, rows.map((r) => r.id)),
      repo.thumbnailUrls(user.client, rows),
      balanceForDisplay(user),
      repo.latestAudits(user.client, rows.map((r) => r.id)),
    ]);
    const items = rows.map((row) =>
      rowToAdCampaign(row, {
        stats: stats.get(row.id),
        audits: audits.get(row.id),
        fallbackLeaderId: session.leaderId,
        imageUrl: thumbs.get(row.id),
        reachPerKes: settings.reachPerKes,
      })
    );
    return ok({ ok: true, items, quote: trackerAdQuote(), walletBalance: balance });
  });
}

/** Composer submit: validate, create the adly_campaigns row, then queue for approval or publish. */
/** The project's owner (changemakers.user_id) is `userId` (Ownership rule, docs/tracker-backend.md). */
async function ownsProject(projectId: string, userId: string): Promise<boolean> {
  const owner = await getRepositories().content.projectOwnerUserId?.(projectId);
  return Boolean(owner && owner === userId);
}

export async function createTrackerAd(session: AuthSession, body: unknown, requestOrigin: string): Promise<ContentResult> {
  if (session.role !== "leader" && session.role !== "aspirant") {
    return fail(403, "Only leaders and aspirants can run ads from their dashboard.");
  }
  if (!session.leaderId) return fail(403, "Your account is not linked to a leader profile.");
  if (!isRecord(body)) return fail(400, "Campaign body must be an object.");
  const leaderId = session.leaderId;
  const settings = trackerAdSettings();

  const project = await getRepositories().content.findProject(asString(body.projectId) ?? "");
  // Ownership rule: the project's owner auth user id, never a leader id.
  if (!project || !(await ownsProject(project.id, session.userId))) {
    return fail(400, "Choose one of your own projects to promote.");
  }
  if (!project.image) return fail(400, "Add a project image before running an ad.");

  const headline = asString(body.headline) ?? "";
  const text = asString(body.body) ?? "";
  if (!headline) return fail(400, "Add a headline.");
  if (headline.length > AD_LIMITS.headline) return fail(400, `Keep the headline to ${AD_LIMITS.headline} characters.`);
  if (!text) return fail(400, "Add the ad text.");
  if (text.length > AD_LIMITS.body) return fail(400, `Keep the ad text to ${AD_LIMITS.body} characters.`);

  const keywords = Array.from(
    new Set(
      (Array.isArray(body.keywords) ? body.keywords : [])
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim().replace(/\s+/g, " "))
        .filter(Boolean)
    )
  );
  if (!keywords.length) return fail(400, "Add at least one keyword.");
  if (keywords.length > AD_LIMITS.keywords) return fail(400, `Use at most ${AD_LIMITS.keywords} keywords.`);
  if (keywords.some((k) => k.length > AD_LIMITS.keywordLength)) {
    return fail(400, `Keywords must be ${AD_LIMITS.keywordLength} characters or fewer.`);
  }

  const platforms = Array.from(
    new Set((Array.isArray(body.platforms) ? body.platforms : []).filter((p): p is AdPlatform => p === "x" || p === "google"))
  );
  if (!platforms.length) return fail(400, "Choose at least one network: X or Google.");
  if (platforms.includes("x")) {
    const blocked = xPolicyError(project, { headline, body: text, keywords }, project.name);
    if (blocked) return fail(422, blocked);
  }
  // The composer may pick another of the project's photos (Adly's image check).
  const imageUrl = await chosenAdImage(project, body.imageUrl);

  const budgetKes = Math.round(Number(body.budgetKes));
  if (!Number.isFinite(budgetKes) || budgetKes < settings.minBudgetKes) {
    return fail(400, `The minimum budget is KES ${settings.minBudgetKes.toLocaleString()}.`);
  }
  if (budgetKes > settings.maxBudgetKes) return fail(400, `The maximum budget is KES ${settings.maxBudgetKes.toLocaleString()}.`);
  const durationDays = Math.round(Number(body.durationDays));
  if (!Number.isFinite(durationDays) || durationDays < AD_LIMITS.minDays || durationDays > AD_LIMITS.maxDays) {
    return fail(400, `Run the ad for ${AD_LIMITS.minDays}–${AD_LIMITS.maxDays} days.`);
  }

  const origin = siteOrigin(requestOrigin) ?? requestOrigin;
  const landingUrl = `${origin.replace(/\/$/, "")}/projects/${project.slug}`;

  return guard(async () => {
    const user = await signedIn(session.userId);
    if (!settings.requireApproval) {
      const balance = await availableBalance(user);
      if (balance < budgetKes) return fail(402, `Your wallet has KES ${balance.toLocaleString()} available. Top up or lower the budget.`);
    }
    let row = await repo.insertCampaign(
      user.client,
      adComposerToRow(
        {
          name: (asString(body.name) ?? `${project.name} — ad`).slice(0, 120),
          headline,
          body: text,
          keywords,
          platforms,
          budgetKes,
          durationDays,
          landingUrl,
          imageUrl,
          projectId: project.id,
          projectTitle: project.name,
          leaderId,
          estimatedReach: Math.round(budgetKes * settings.reachPerKes),
          requireApproval: settings.requireApproval,
        },
        user.userId
      )
    );

    // Best effort: copy the project photo into the bucket so X can attach it.
    try {
      const asset = await repo.uploadImageFromUrl(user.client, user.userId, row.id, imageUrl);
      const creative = obj(row.creative);
      const xShape = obj(obj(creative.platforms).x);
      row = await repo.updateCampaign(user.client, row, {
        creative: {
          ...creative,
          media: [asset],
          thumbnail_asset_id: asset.id,
          platforms: { ...obj(creative.platforms), x: { ...xShape, asset_ids: [asset.id] } },
        },
      });
    } catch (error) {
      // X runs text-only; Google search ads take no image.
      console.warn("[adly] project image not copied:", row.id, error instanceof Error ? error.message : error);
    }

    let summary: string | undefined;
    let warnings: string[] = [];
    if (!settings.requireApproval) {
      const outcome = await publishPlan(user, row, { origin: requestOrigin });
      row = outcome.row ?? row;
      summary = summarizePublish(outcome.results);
      warnings = publishWarnings(outcome);
    }
    const stats = (await repo.listStats(user.client, [row.id])).get(row.id) ?? [];
    const item = rowToAdCampaign(row, { stats, fallbackLeaderId: leaderId, reachPerKes: settings.reachPerKes });
    if (summary) item.statusNote = summary;
    return ok({ ok: true, item, warnings, walletBalance: await balanceForDisplay(user) }, 201);
  });
}

export type TrackerAdAction = "approve" | "reject" | "publish" | "pause" | "resume" | "stop" | "sync";

export function asTrackerAdAction(value: unknown): TrackerAdAction | null {
  return ["approve", "reject", "publish", "pause", "resume", "stop", "sync"].includes(value as string)
    ? (value as TrackerAdAction)
    : null;
}

export async function actOnTrackerAd(
  session: AuthSession,
  id: string,
  action: TrackerAdAction,
  note?: string,
  requestOrigin?: string
): Promise<ContentResult> {
  return guard(async () => {
    const settings = trackerAdSettings();
    const view = (row: AdlyCampaignRow, stats?: Awaited<ReturnType<typeof repo.listStats>>, leaderId?: string) =>
      rowToAdCampaign(row, { stats: stats?.get(row.id), fallbackLeaderId: leaderId, reachPerKes: settings.reachPerKes });

    if (action === "pause" || action === "resume" || action === "stop") {
      return fail(
        501,
        "Pausing and stopping ads is not available yet. Manage the running campaign in the network's Ads Manager."
      );
    }

    if ((action === "publish" || action === "sync") && !isEditorRole(session.role)) {
      return fail(403, "Only leaders, aspirants and admins can publish or refresh ads.");
    }

    if (session.role === "admin" && (action === "approve" || action === "reject")) {
      const service = serviceClient();
      const row = await repo.findCampaign(service, id);
      if (!row) return fail(404, "Campaign not found.");
      // Drafts waiting for a first approval, and published campaigns whose edits wait for one.
      if (row.status === "archived" || readSiasaMeta(row.metadata).review?.state !== "pending") {
        return fail(400, "This ad is not waiting for approval.");
      }
      const review: SiasaReview = {
        state: action === "approve" ? "approved" : "rejected",
        note: action === "reject" ? note : undefined,
        at: new Date().toISOString(),
        by: session.userId,
      };
      const saved = await repo.adminUpdateMetadata(service, row, withSiasaMeta(row.metadata, { review }));
      const leaders = await repo.leaderIdsForUsers(service, [saved.user_id]);
      return ok({ ok: true, item: view(saved, undefined, leaders.get(saved.user_id)) });
    }

    const user = await signedIn(session.userId);
    const row = await repo.findCampaign(user.client, id);
    if (!row && session.role === "admin" && action === "sync") {
      // Admin viewing someone else's ad: sync-ad-insights only runs for the owner,
      // so return the last stored results (service role: RLS is owner-only).
      const service = serviceClient();
      const other = await repo.findCampaign(service, id);
      if (!other) return fail(404, "Campaign not found.");
      const [stats, leaders] = await Promise.all([
        repo.listStats(service, [id]),
        repo.leaderIdsForUsers(service, [other.user_id]),
      ]);
      return ok({ ok: true, item: view(other, stats, leaders.get(other.user_id)) });
    }
    if (!row) return fail(404, "Campaign not found.");

    if (action === "approve") return fail(403, "Only an admin can approve ads.");

    if (action === "reject") {
      // Owner cancels before publishing. Nothing was charged: the Tracker debits on publish.
      if (row.status !== "draft" || hasProviderCampaign(row)) {
        return fail(400, "Only ads that have not been published can be cancelled.");
      }
      const saved = await repo.updateCampaign(user.client, row, {
        status: "archived",
        metadata: withSiasaMeta(row.metadata, {
          review: { state: "cancelled", at: new Date().toISOString(), by: user.userId },
        }),
      });
      return ok({ ok: true, item: view(saved, undefined, session.leaderId) });
    }

    if (action === "publish") {
      const blocked = approvalBlocks(row);
      if (blocked) return fail(409, blocked);
      const policy = await xPolicyBlock(row, resolvePublishChannels(row.channels));
      if (policy) return fail(422, policy);
      const outcome = await publishPlan(user, row, { origin: requestOrigin });
      const current = outcome.row ?? row;
      const stats = await repo.listStats(user.client, [current.id]);
      const item = view(current, stats, session.leaderId);
      item.statusNote = [summarizePublish(outcome.results), item.statusNote].filter(Boolean).join(" ");
      return ok({
        ok: true,
        item,
        results: outcome.results,
        warnings: publishWarnings(outcome),
        walletBalance: await balanceForDisplay(user),
      });
    }

    // sync
    if (row.status === "draft") return ok({ ok: true, item: view(row, undefined, session.leaderId) });
    const synced = await syncInsights(user, id);
    const current = (await repo.findCampaign(user.client, id)) ?? row;
    const item = view(current, new Map([[id, synced.stats]]), session.leaderId);
    if (synced.message) item.statusNote = synced.message;
    return ok({ ok: true, item, errors: synced.errors, walletBalance: await balanceForDisplay(user) });
  });
}

// ===========================================================================
// Adly workspace

/**
 * Campaigns, creatives, policy reviews and insights come from the Tracker.
 * Posters, timelapses and simulations have no Tracker table yet and stay on
 * the memory adapter (see the proposed adly_studio_items migration).
 */
export async function readTrackerWorkspace(actor: ContentActor): Promise<ContentResult> {
  return guard(async () => {
    const legacy = await visibleAdly(actor);
    let rows: AdlyCampaignRow[];
    let client: SupabaseClient;
    let leaderFor: (row: AdlyCampaignRow) => string | undefined;
    if (actor.role === "admin") {
      // Admins see every campaign; RLS is owner-only, so the service role reads.
      client = serviceClient();
      rows = await repo.adminListCampaigns(client);
      const leaders = await repo.leaderIdsForUsers(client, rows.map((r) => r.user_id));
      leaderFor = (row) => leaders.get(row.user_id);
    } else {
      const user = await signedIn(actor.userId);
      client = user.client;
      rows = await repo.listOwnCampaigns(client, user.userId);
      leaderFor = () => actor.leaderId;
    }
    const content = await workspaceFromRows(client, rows, leaderFor, legacy);
    return ok({ ok: true, content, stats: computeAdlyStats(content), backend: "tracker" });
  });
}

async function workspaceFromRows(
  client: SupabaseClient,
  rows: AdlyCampaignRow[],
  leaderFor: (row: AdlyCampaignRow) => string | undefined,
  legacy: AdlyContent
): Promise<AdlyContent> {
  const live = rows.filter((r) => r.status !== "archived");
  const ids = live.map((r) => r.id);
  const [stats, thumbs, recos] = await Promise.all([
    repo.listStats(client, ids),
    repo.thumbnailUrls(client, live),
    repo.listRecommendations(client, ids, "pending"),
  ]);
  const campaigns: Campaign[] = [];
  const creatives: AdCreative[] = [];
  const policyReviews: PolicyReview[] = [];
  const insights: AdlyInsight[] = [];
  for (const row of live) {
    const ctx = { stats: stats.get(row.id), fallbackLeaderId: leaderFor(row) };
    campaigns.push(rowToCampaign(row, ctx));
    const creative = rowToCreative(row, { ...ctx, imageUrl: thumbs.get(row.id) });
    if (creative) creatives.push(creative);
    const review = readSiasaMeta(row.metadata).policy_review;
    if (review) policyReviews.push({ ...review, campaignId: row.id });
    insights.push(...insightErrorsToInsights(row));
  }
  for (const reco of recos.slice(0, 50)) insights.push(recommendationToInsight(reco, reco.campaign_id ?? ""));
  return {
    campaigns,
    creatives,
    policyReviews,
    posters: legacy.posters,
    timelapses: legacy.timelapses,
    simulations: legacy.simulations,
    insights,
  };
}

/**
 * Save an Adly workspace plan in one call: the campaign, its creative and the
 * policy pre-check. Body: { campaign, creative?, policyReview? }.
 */
export async function saveTrackerPlan(actor: ContentActor, body: unknown): Promise<ContentResult> {
  if (!isRecord(body) || !isRecord(body.campaign)) return fail(400, "campaign is required.");
  const campaignBody = body.campaign;
  return guard(async () => {
    const user = await signedIn(actor.userId);
    const settings = trackerAdSettings();
    const requestedId = asString(campaignBody.id);
    // A uuid names a stored row: it has to be the caller's. Other ids are client
    // placeholders for a new campaign (the Tracker assigns the uuid).
    const existing = requestedId && repo.isUuid(requestedId) ? await repo.findCampaign(user.client, requestedId) : null;
    if (requestedId && repo.isUuid(requestedId) && !existing) return notOwned(actor, requestedId, "edit");
    const stamped = actor.role === "admin" ? campaignBody : { ...campaignBody, leaderId: actor.leaderId };
    const parsed = parseCampaign(stamped, existing ? rowToCampaign(existing) : undefined);
    if (typeof parsed === "string") return fail(400, parsed);
    if (actor.role !== "admin") parsed.leaderId = actor.leaderId;
    let projectTitle: string | undefined;
    if (parsed.projectId) {
      const project = await getRepositories().content.findProject(parsed.projectId);
      if (!project) return fail(400, "That project was not found.");
      if (actor.role !== "admin" && !(await ownsProject(project.id, actor.userId))) {
        return fail(403, "That project is not on your profile.");
      }
      projectTitle = project.name;
    }
    const writeOptions = { projectTitle, requireApproval: settings.requireApproval };

    let row = existing
      ? await repo.updateCampaign(user.client, existing, campaignToRow(parsed, existing, writeOptions))
      : await repo.insertCampaign(user.client, { ...campaignToRow(parsed, null, writeOptions), user_id: user.userId });

    if (isRecord(body.creative)) {
      const creative = parseSiasaCreative({ ...body.creative, id: `cr_${row.id}` });
      if (typeof creative === "string") return fail(400, creative);
      row = await repo.updateCampaign(user.client, row, creativeToRow(creative, row, writeOptions));
    }
    if (isRecord(body.policyReview)) {
      const review = parsePolicyReview({ ...body.policyReview, campaignId: row.id });
      if (typeof review === "string") return fail(400, review);
      row = await repo.updateCampaign(user.client, row, { metadata: withSiasaMeta(row.metadata, { policy_review: review }) });
    }
    const stats = (await repo.listStats(user.client, [row.id])).get(row.id);
    return ok(
      {
        ok: true,
        item: rowToCampaign(row, { stats, fallbackLeaderId: actor.role === "admin" ? undefined : actor.leaderId }),
        creative: rowToCreative(row, { stats }),
      },
      existing ? 200 : 201
    );
  });
}

/** Save one creative (id cr_<campaign uuid>) into its campaign's creative jsonb. */
export async function saveTrackerCreative(actor: ContentActor, body: unknown): Promise<ContentResult> {
  if (!isRecord(body)) return fail(400, "Creative body must be an object.");
  const campaignId = campaignIdFromCreativeId(asString(body.id) ?? "");
  if (!campaignId) return fail(400, "Save the creative together with its campaign.");
  return guard(async () => {
    const user = await signedIn(actor.userId);
    const row = await repo.findCampaign(user.client, campaignId);
    if (!row) return notOwned(actor, campaignId, "edit");
    const parsed = parseSiasaCreative(body, rowToCreative(row) ?? undefined);
    if (typeof parsed === "string") return fail(400, parsed);
    const saved = await repo.updateCampaign(
      user.client,
      row,
      creativeToRow(parsed, row, { requireApproval: trackerAdSettings().requireApproval })
    );
    return ok({ ok: true, item: rowToCreative(saved) });
  });
}

const RUNNING_STATUSES = ["live", "submitted", "paused"];

/**
 * Drafts are deleted; anything that reached a network is archived to keep its
 * audit trail. A campaign that is running on a network is refused: archiving
 * in Siasa does not stop it there.
 */
export async function deleteTrackerCampaign(actor: ContentActor, id: string): Promise<ContentResult> {
  return guard(async () => {
    const user = await signedIn(actor.userId);
    const row = await repo.findCampaign(user.client, id);
    if (!row) return notOwned(actor, id, "delete");
    if (isClaimActive(readSiasaMeta(row.metadata).publishing)) return fail(409, PUBLISHING_MESSAGE);
    const onNetwork = providerCampaignChannels(row);
    if (onNetwork.length && RUNNING_STATUSES.includes(row.status)) {
      const where = onNetwork.map(providerName).join(" and ");
      return fail(
        409,
        `This campaign is running on ${where}. Stop it in ${onNetwork.length > 1 ? "each network's" : `${where}'s`} Ads Manager first, then archive it here.`
      );
    }
    const touchedNetwork =
      onNetwork.length > 0 || Object.keys(obj(row.metadata)).some((k) => k.endsWith("_campaign_id")) || row.status !== "draft";
    if (touchedNetwork) await repo.updateCampaign(user.client, row, { status: "archived" });
    else await repo.deleteCampaign(user.client, row);
    return ok({ ok: true, archived: touchedNetwork });
  });
}

// ===========================================================================
// Adly agent (chat)

export async function readConversation(campaignId: string, expectedUserId?: string): Promise<ContentResult> {
  return guard(async () => {
    const user = await signedIn(expectedUserId);
    const row = await repo.findCampaign(user.client, campaignId);
    if (!row) return fail(404, "Campaign not found.");
    const [messages, recommendations, stats] = await Promise.all([
      repo.listMessages(user.client, campaignId),
      repo.listRecommendations(user.client, [campaignId]),
      repo.listStats(user.client, [campaignId]),
    ]);
    return ok({
      ok: true,
      messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
      recommendations: recommendations.map((r) => ({
        id: r.id,
        channel: r.channel,
        headline: r.headline,
        body: r.body,
        status: r.status,
        kind: typeof obj(r.metadata).kind === "string" ? obj(r.metadata).kind : null,
        createdAt: r.created_at,
      })),
      channels: (stats.get(campaignId) ?? []).map((s) => ({
        provider: s.provider,
        impressions: Number(s.impressions) || 0,
        clicks: Number(s.clicks) || 0,
        spendKes: Number(s.spend_kes) || 0,
        approvalStatus: s.approval_status,
        syncedAt: s.synced_at ?? null,
      })),
      publishable: resolvePublishChannels(row.channels),
      awaitingApproval: approvalBlocks(row),
      publishing: isClaimActive(readSiasaMeta(row.metadata).publishing),
      unpaid: readSiasaMeta(row.metadata).unpaid ?? [],
      status: row.status,
      hasCreative: Boolean(parseCreative(row.creative).headline || parseCreative(row.creative).body),
    });
  });
}

/**
 * One chat turn with the adly-agent edge function. The function stores both
 * the user message and the reply in ad_campaign_messages, and may add rows to
 * ad_recommendations.
 */
export async function chatWithAdly(campaignId: string, body: unknown, expectedUserId?: string): Promise<ContentResult> {
  const message = isRecord(body) ? asString(body.message) : undefined;
  if (!message) return fail(400, "Type a message for Adly.");
  if (message.length > 4000) return fail(400, "Keep the message under 4,000 characters.");
  return guard(async () => {
    const user = await signedIn(expectedUserId);
    const res = await callEdge("adly-agent", user.token, { campaignId, message, stream: false }, 115_000);
    if (!res.ok || res.json.ok === false) {
      if (res.status === 503) return fail(503, "Adly is not switched on for this project yet.");
      return fail(res.status >= 400 && res.status < 500 ? res.status : 502, edgeErrorMessage(res, "Adly could not answer", `adly-agent ${campaignId}`));
    }
    return ok({
      ok: true,
      reply: typeof res.json.reply === "string" ? res.json.reply : "",
      recommendationIds: Array.isArray(res.json.recommendationIds) ? res.json.recommendationIds : [],
      chatPills: Array.isArray(res.json.chatPills) ? res.json.chatPills : [],
    });
  });
}

/** Dismiss or mark applied an Adly recommendation (applying to the plan stays in the Tracker UI for now). */
export async function setRecommendation(campaignId: string, body: unknown, expectedUserId?: string): Promise<ContentResult> {
  if (!isRecord(body)) return fail(400, "Body must be an object.");
  const id = asString(body.id);
  const status = body.status === "dismissed" || body.status === "applied" ? body.status : null;
  if (!id || !status) return fail(400, "id and status (dismissed | applied) are required.");
  return guard(async () => {
    const user = await signedIn(expectedUserId);
    const owned = await repo.listRecommendations(user.client, [campaignId]);
    if (!owned.some((r) => r.id === id)) return fail(404, "Recommendation not found.");
    await repo.setRecommendationStatus(user.client, id, status);
    return ok({ ok: true });
  });
}

/** POST /api/adly/insights/[id]: refresh network results for one campaign. */
export async function syncCampaignInsights(session: AuthSession, campaignId: string): Promise<ContentResult> {
  return guard(async () => {
    const user = await signedIn(session.userId);
    const row = await repo.findCampaign(user.client, campaignId);
    if (!row) return fail(404, "Campaign not found.");
    const synced = await syncInsights(user, campaignId);
    const current = (await repo.findCampaign(user.client, campaignId)) ?? row;
    return ok({
      ok: true,
      live: synced.live,
      message: synced.message,
      errors: synced.errors,
      campaign: rowToCampaign(current, { stats: synced.stats, fallbackLeaderId: session.leaderId }),
    });
  });
}
