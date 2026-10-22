import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AdPublishAuditRow,
  CAMPAIGN_COLUMNS,
  STAT_COLUMNS,
  type AdChannelStatRow,
  type AdCampaignMessageRow,
  type AdlyCampaignRow,
  type AdRecommendationRow,
} from "@/server/tracker/adly/rows";
import type { RowWrite } from "@/server/tracker/adly/mapping";
import { isAdNetworkLandingUrl, parseCreative, type AdlyMediaAsset } from "@/server/tracker/adly/plan";

/**
 * Data access for the Tracker's Adly tables. Every function takes the client
 * to use: the user's client (RLS: owner only) for anything a politician does,
 * the service client only for the admin functions at the bottom.
 */

export const CREATIVE_BUCKET = "adly-creative-media";

function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

export async function listOwnCampaigns(client: SupabaseClient, userId: string): Promise<AdlyCampaignRow[]> {
  const { data, error } = await client
    .from("adly_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) fail("Could not load campaigns", error);
  return (data ?? []) as AdlyCampaignRow[];
}

export async function findCampaign(client: SupabaseClient, id: string): Promise<AdlyCampaignRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await client.from("adly_campaigns").select(CAMPAIGN_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("Could not load the campaign", error);
  return (data as AdlyCampaignRow | null) ?? null;
}

export async function insertCampaign(
  client: SupabaseClient,
  write: RowWrite & { user_id: string }
): Promise<AdlyCampaignRow> {
  const { data, error } = await client.from("adly_campaigns").insert(write).select(CAMPAIGN_COLUMNS).single();
  if (error) fail("Could not create the campaign", error);
  return data as AdlyCampaignRow;
}

export async function updateCampaign(client: SupabaseClient, id: string, write: RowWrite): Promise<AdlyCampaignRow> {
  const { data, error } = await client
    .from("adly_campaigns")
    .update({ ...write, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) fail("Could not save the campaign", error);
  return data as AdlyCampaignRow;
}

/** Hard delete. Only used for drafts that never reached a network. */
export async function deleteCampaign(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("adly_campaigns").delete().eq("id", id);
  if (error) fail("Could not delete the campaign", error);
}

export async function listStats(client: SupabaseClient, campaignIds: string[]): Promise<Map<string, AdChannelStatRow[]>> {
  const out = new Map<string, AdChannelStatRow[]>();
  if (!campaignIds.length) return out;
  const { data, error } = await client.from("ad_channel_stats").select(STAT_COLUMNS).in("campaign_id", campaignIds);
  if (error) return out; // stats are optional on every screen
  for (const row of (data ?? []) as AdChannelStatRow[]) {
    const list = out.get(row.campaign_id) ?? [];
    list.push(row);
    out.set(row.campaign_id, list);
  }
  return out;
}

/** Latest publish audit per (campaign, provider). */
export async function latestAudits(
  client: SupabaseClient,
  campaignIds: string[]
): Promise<Map<string, AdPublishAuditRow[]>> {
  const out = new Map<string, AdPublishAuditRow[]>();
  if (!campaignIds.length) return out;
  const { data, error } = await client
    .from("ad_publish_audit")
    .select("campaign_id, provider, status, error, response_payload, created_at")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return out;
  for (const row of (data ?? []) as AdPublishAuditRow[]) {
    const list = out.get(row.campaign_id) ?? [];
    if (!list.some((a) => a.provider === row.provider)) list.push(row);
    out.set(row.campaign_id, list);
  }
  return out;
}

export async function listMessages(client: SupabaseClient, campaignId: string): Promise<AdCampaignMessageRow[]> {
  const { data, error } = await client
    .from("ad_campaign_messages")
    .select("id, role, content, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as AdCampaignMessageRow[];
}

export async function listRecommendations(
  client: SupabaseClient,
  campaignIds: string[],
  status?: "pending" | "applied" | "dismissed"
): Promise<AdRecommendationRow[]> {
  if (!campaignIds.length) return [];
  let query = client
    .from("ad_recommendations")
    .select("id, campaign_id, channel, headline, body, status, created_at, metadata")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as AdRecommendationRow[];
}

export async function setRecommendationStatus(
  client: SupabaseClient,
  id: string,
  status: "pending" | "applied" | "dismissed"
): Promise<void> {
  const { error } = await client.from("ad_recommendations").update({ status }).eq("id", id);
  if (error) fail("Could not update the recommendation", error);
}

/**
 * Signed URLs for creative thumbnails in the private bucket, for rows that
 * have no public Siasa image. Keyed by campaign id. One request for all rows.
 */
export async function thumbnailUrls(client: SupabaseClient, rows: AdlyCampaignRow[]): Promise<Map<string, string>> {
  const wanted: { id: string; path: string }[] = [];
  for (const row of rows) {
    const creative = parseCreative(row.creative);
    const media = creative.media ?? [];
    const thumb =
      media.find((m) => m.id === creative.thumbnail_asset_id && m.kind === "image") ?? media.find((m) => m.kind === "image");
    if (thumb) wanted.push({ id: row.id, path: thumb.path });
  }
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  const { data, error } = await client.storage.from(CREATIVE_BUCKET).createSignedUrls(
    wanted.map((w) => w.path),
    60 * 60
  );
  if (error || !data) return out;
  data.forEach((entry, i) => {
    if (entry.signedUrl) out.set(wanted[i].id, entry.signedUrl);
  });
  return out;
}

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Copy a public image into `{user_id}/{campaign_id}/` in the creative bucket,
 * so the publish functions (which read bucket paths, not URLs) can attach it.
 */
export async function uploadImageFromUrl(
  client: SupabaseClient,
  userId: string,
  campaignId: string,
  url: string
): Promise<AdlyMediaAsset> {
  // Only public https hosts: the URL comes from user content (project images).
  if (!url.startsWith("https://") || !isAdNetworkLandingUrl(url)) {
    throw new Error("The ad image must be a public https URL.");
  }
  const res = await fetch(url, { cache: "no-store", redirect: "error" });
  if (!res.ok) throw new Error(`Could not download the ad image (${res.status}).`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = IMAGE_TYPES[contentType];
  if (!ext) throw new Error("The ad image must be a JPEG, PNG, WebP or GIF.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("The ad image is larger than 5 MB.");
  const id = crypto.randomUUID();
  const filename = `siasa-${id.slice(0, 8)}.${ext}`;
  const path = `${userId}/${campaignId}/${filename}`;
  const { error } = await client.storage.from(CREATIVE_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) fail("Could not store the ad image", error);
  return { id, path, kind: "image", filename, bytes: bytes.byteLength, contentType };
}

// ---------------------------------------------------------------------------
// Admin (service role)

/**
 * Every campaign, for the admin ads page. Service role because adly_campaigns
 * RLS is owner-only and has no admin rule.
 */
export async function adminListCampaigns(service: SupabaseClient, limit = 500): Promise<AdlyCampaignRow[]> {
  const { data, error } = await service
    .from("adly_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("Could not load campaigns", error);
  return (data ?? []) as AdlyCampaignRow[];
}

/** auth user id -> political_figures.id, for showing whose ad it is. */
export async function leaderIdsForUsers(service: SupabaseClient, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(userIds)).filter(isUuid);
  if (!ids.length) return out;
  const { data } = await service.from("political_figures").select("id, user_id").in("user_id", ids);
  for (const row of (data ?? []) as { id: string; user_id: string }[]) out.set(row.user_id, row.id);
  return out;
}

/**
 * Write the Siasa approval decision into metadata.siasa.review. Service role
 * because the admin does not own the row (RLS is owner-only). Only the
 * metadata column is touched; the owner still publishes with their own token.
 */
export async function adminUpdateMetadata(
  service: SupabaseClient,
  id: string,
  metadata: Record<string, unknown>,
  status?: string
): Promise<AdlyCampaignRow> {
  const { data, error } = await service
    .from("adly_campaigns")
    .update({ metadata, ...(status ? { status } : {}), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) fail("Could not update the campaign", error);
  return data as AdlyCampaignRow;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
