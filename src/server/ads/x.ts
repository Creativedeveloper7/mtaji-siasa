import { createHmac, randomBytes } from "node:crypto";
import { KENYA, xConfig } from "@/server/ads/config";

/**
 * X Ads API (v12) with OAuth 1.0a user context.
 * A campaign is: promoted-only post (with the project image) -> campaign ->
 * line item (REACH) -> targeting (Kenya + keywords) -> promoted post.
 */
const ADS = "https://ads-api.x.com/12";

const pct = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function authorization(method: string, url: string): string {
  const cfg = xConfig();
  const oauth: Record<string, string> = {
    oauth_consumer_key: cfg.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: cfg.accessToken,
    oauth_version: "1.0",
  };
  const parsed = new URL(url);
  // Query parameters are signed; multipart and JSON bodies are not.
  const params: [string, string][] = [...parsed.searchParams.entries(), ...Object.entries(oauth)];
  const normalized = params
    .map(([k, v]) => [pct(k), pct(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const base = [method.toUpperCase(), pct(parsed.origin + parsed.pathname), pct(normalized)].join("&");
  const signature = createHmac("sha1", `${pct(cfg.apiSecret)}&${pct(cfg.accessSecret)}`)
    .update(base)
    .digest("base64");
  return (
    "OAuth " +
    Object.entries({ ...oauth, oauth_signature: signature })
      .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
      .join(", ")
  );
}

export class XAdsError extends Error {}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  init: { query?: Record<string, string | undefined>; json?: unknown; form?: FormData } = {}
): Promise<T> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value !== undefined && value !== "") target.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { Authorization: authorization(method, target.toString()) };
  let body: BodyInit | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    body = init.form;
  }
  const response = await fetch(target, { method, headers, body });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const errors = (data as { errors?: { message?: string; detail?: string; code?: string }[] } | null)?.errors;
    const message = errors?.map((e) => e.message || e.detail || e.code).filter(Boolean).join("; ");
    throw new XAdsError(`X ${response.status}: ${message || text.slice(0, 300) || response.statusText}`);
  }
  return data as T;
}

const account = () => `${ADS}/accounts/${xConfig().accountId}`;

/** Upload a JPEG; returns the media key that ads endpoints use. */
async function uploadImage(jpeg: Buffer): Promise<string> {
  const form = new FormData();
  form.append("media", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "ad.jpg");
  form.append("media_category", "tweet_image");
  try {
    const result = await call<{ data?: { id?: string; media_key?: string } }>(
      "POST",
      "https://api.x.com/2/media/upload",
      { form }
    );
    if (result.data?.media_key) return result.data.media_key;
    if (result.data?.id) return `3_${result.data.id}`;
  } catch (error) {
    if (!(error instanceof XAdsError) || !/X (403|404|410)/.test(error.message)) throw error;
  }
  // Older apps only have the v1.1 upload endpoint.
  const legacy = new FormData();
  legacy.append("media", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "ad.jpg");
  legacy.append("media_category", "tweet_image");
  const result = await call<{ media_key?: string; media_id_string?: string }>(
    "POST",
    "https://upload.twitter.com/1.1/media/upload.json",
    { form: legacy }
  );
  if (result.media_key) return result.media_key;
  if (result.media_id_string) return `3_${result.media_id_string}`;
  throw new XAdsError("X did not return a media key for the uploaded image.");
}

async function promotableUserId(): Promise<string> {
  const result = await call<{ data: { user_id: string; promotable_user_type: string }[] }>(
    "GET",
    `${account()}/promotable_users`
  );
  const user = result.data.find((u) => u.promotable_user_type === "FULL") ?? result.data[0];
  if (!user) throw new XAdsError("The X ads account has no promotable user.");
  return user.user_id;
}

const micros = (usd: number) => String(Math.max(1, Math.round(usd * 100)) * 10_000);

export interface XLaunchInput {
  name: string;
  text: string;
  image: Buffer;
  keywords: string[];
  totalUsd: number;
  days: number;
  start: Date;
  end: Date;
}

export async function launchX(input: XLaunchInput): Promise<Record<string, string>> {
  const cfg = xConfig();
  const ids: Record<string, string> = {};
  try {
    const mediaKey = await uploadImage(input.image);
    ids.mediaKey = mediaKey;
    await call("POST", `${account()}/media_library`, { query: { media_key: mediaKey } }).catch((error) => {
      // Already in the library is fine.
      if (!/already|DUPLICATE/i.test(String(error))) throw error;
    });
    const userId = await promotableUserId();
    const tweet = await call<{ data: { id_str?: string; id?: string } }>("POST", `${account()}/tweet`, {
      query: { text: input.text, media_keys: mediaKey, nullcast: "true", as_user_id: userId },
    });
    ids.tweetId = String(tweet.data.id_str ?? tweet.data.id);

    const campaign = await call<{ data: { id: string } }>("POST", `${account()}/campaigns`, {
      query: {
        name: input.name.slice(0, 255),
        funding_instrument_id: cfg.fundingInstrumentId,
        daily_budget_amount_local_micro: micros(input.totalUsd / input.days),
        total_budget_amount_local_micro: micros(input.totalUsd),
        entity_status: "ACTIVE",
      },
    });
    ids.campaignId = campaign.data.id;

    const lineItem = await call<{ data: { id: string } }>("POST", `${account()}/line_items`, {
      query: {
        campaign_id: ids.campaignId,
        name: input.name.slice(0, 255),
        objective: "REACH",
        product_type: "PROMOTED_TWEETS",
        placements: "ALL_ON_TWITTER",
        bid_strategy: "AUTO",
        start_time: input.start.toISOString(),
        end_time: input.end.toISOString(),
        entity_status: "ACTIVE",
      },
    });
    ids.lineItemId = lineItem.data.id;

    const criteria = [
      { targeting_type: "LOCATION", targeting_value: KENYA.x },
      ...input.keywords.map((keyword) => ({ targeting_type: "BROAD_KEYWORD", targeting_value: keyword })),
    ];
    await call("POST", `${ADS}/batch/accounts/${cfg.accountId}/targeting_criteria`, {
      json: criteria.map((params) => ({
        operation_type: "Create",
        params: { line_item_id: ids.lineItemId, ...params },
      })),
    });

    await call("POST", `${account()}/promoted_tweets`, {
      query: { line_item_id: ids.lineItemId, tweet_ids: ids.tweetId },
    });
    return ids;
  } catch (error) {
    // Do not leave a half-built campaign able to spend.
    if (ids.campaignId) {
      await call("DELETE", `${account()}/campaigns/${ids.campaignId}`).catch(() => undefined);
    }
    throw error;
  }
}

/** Dry run: confirm the account, payment method and promotable user without creating anything. */
export async function checkX(): Promise<Record<string, string>> {
  const cfg = xConfig();
  const funding = await call<{ data: { id: string; entity_status: string; able_to_fund?: boolean }[] }>(
    "GET",
    `${account()}/funding_instruments`
  );
  const instrument = funding.data.find((f) => f.id === cfg.fundingInstrumentId);
  if (!instrument) throw new XAdsError("X_FUNDING_INSTRUMENT_ID is not on this ads account.");
  if (instrument.entity_status !== "ACTIVE") throw new XAdsError(`X payment method is ${instrument.entity_status}.`);
  const userId = await promotableUserId();
  return { dryRun: "true", promotableUser: userId };
}

export async function setXStatus(ids: Record<string, string>, active: boolean): Promise<void> {
  if (!ids.campaignId) return;
  await call("PUT", `${account()}/campaigns/${ids.campaignId}`, {
    query: { entity_status: active ? "ACTIVE" : "PAUSED" },
  });
}

/** Impressions, clicks and spend (USD) since the campaign started. Stats windows are at most 7 days. */
export async function xStats(
  ids: Record<string, string>,
  since: Date
): Promise<{ impressions: number; clicks: number; spentUsd: number }> {
  const totals = { impressions: 0, clicks: 0, spentUsd: 0 };
  if (!ids.campaignId) return totals;
  const hour = 3_600_000;
  let from = new Date(Math.floor(since.getTime() / hour) * hour);
  const until = new Date(Math.ceil(Date.now() / hour) * hour);
  const sum = (values?: (number | null)[] | null) => (values ?? []).reduce<number>((a, b) => a + (b ?? 0), 0);
  while (from < until) {
    const to = new Date(Math.min(until.getTime(), from.getTime() + 7 * 24 * hour));
    const result = await call<{
      data: { id_data: { metrics: Record<string, (number | null)[] | null> }[] }[];
    }>("GET", `${ADS}/stats/accounts/${xConfig().accountId}`, {
      query: {
        entity: "CAMPAIGN",
        entity_ids: ids.campaignId,
        start_time: from.toISOString(),
        end_time: to.toISOString(),
        granularity: "TOTAL",
        placement: "ALL_ON_TWITTER",
        metric_groups: "ENGAGEMENT,BILLING",
      },
    });
    const metrics = result.data?.[0]?.id_data?.[0]?.metrics ?? {};
    totals.impressions += sum(metrics.impressions);
    totals.clicks += sum(metrics.clicks);
    totals.spentUsd += sum(metrics.billed_charge_local_micro) / 1_000_000;
    from = to;
  }
  return totals;
}
