/**
 * The Adly campaign plan as the Tracker stores it in adly_campaigns
 * (targeting / creative / metadata jsonb), and the request bodies the
 * Tracker's publish-* edge functions expect.
 *
 * Ported from M-taji-Tracker src/lib/adlyCreative.ts, adlyPublishPayload.ts and
 * adlyCampaignScope.ts so rows written here read the same in the Tracker UI and
 * payloads match what the Tracker frontend sends. Keep them in step.
 */
import type { AdlyCampaignRow, TrackerChannel } from "@/server/tracker/adly/rows";

// ---------------------------------------------------------------------------
// jsonb shapes

export type AdlyMediaAsset = {
  id: string;
  /** Path inside the private `adly-creative-media` bucket: `{user_id}/{campaign_id}/...` */
  path: string;
  kind: "image" | "video";
  filename: string;
  bytes?: number;
  contentType?: string;
};

export type AdlyPlatformCreative = {
  meta?: { primary_text?: string; headline?: string; cta?: string; asset_ids?: string[] };
  google?: { headlines?: string[]; descriptions?: string[] };
  youtube?: { headline?: string; description?: string; cta?: string; asset_ids?: string[] };
  tiktok?: {
    hook?: string;
    script?: string;
    video_path?: string;
    cover_image_path?: string;
    video_asset_id?: string;
    cover_asset_id?: string;
  };
  x?: { post?: string; asset_ids?: string[] };
};

/** adly_campaigns.creative */
export type AdlyCreativeJson = {
  hook?: string;
  pillars?: string[];
  tone?: string;
  cta?: string;
  compliance_notes?: string;
  headline?: string;
  body?: string;
  landing_page_url?: string;
  media?: AdlyMediaAsset[];
  thumbnail_asset_id?: string;
  platforms?: AdlyPlatformCreative;
};

/** adly_campaigns.targeting */
export type AdlyTargetingJson = {
  locations?: string[];
  age_group?: string;
  interests?: string[];
  duration_days?: number;
};

/** One entry of adly_campaigns.metadata.location_selections */
export type AdlyLocationSelection = {
  county?: string;
  constituency?: string;
  ward?: string;
  label: string;
  source: "hierarchy" | "osm" | "agent" | "national";
  osmId?: string;
};

// ---------------------------------------------------------------------------
// small readers

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length ? out : undefined;
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function defined<T extends Record<string, unknown>>(o: T): T {
  for (const key of Object.keys(o)) if (o[key] === undefined) delete o[key];
  return o;
}

function parseMedia(v: unknown): AdlyMediaAsset[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: AdlyMediaAsset[] = [];
  for (const item of v) {
    const o = obj(item);
    const id = str(o.id);
    const path = str(o.path);
    const kind = o.kind === "image" || o.kind === "video" ? o.kind : undefined;
    const filename = str(o.filename);
    if (!id || !path || !kind || !filename) continue;
    const asset: AdlyMediaAsset = { id, path, kind, filename };
    if (typeof o.bytes === "number") asset.bytes = o.bytes;
    const contentType = str(o.contentType);
    if (contentType) asset.contentType = contentType;
    out.push(asset);
  }
  return out.length ? out : undefined;
}

/** Same reading rules as the Tracker's parseCreative (unknown keys dropped). */
export function parseCreative(raw: unknown): AdlyCreativeJson {
  const c = obj(raw);
  const p = c.platforms && typeof c.platforms === "object" ? obj(c.platforms) : null;
  const sub = (key: string) => (p && p[key] && typeof p[key] === "object" ? obj(p[key]) : null);
  const meta = sub("meta");
  const google = sub("google");
  const youtube = sub("youtube");
  const tiktok = sub("tiktok");
  const x = sub("x");
  const platforms: AdlyPlatformCreative | undefined = p
    ? defined({
        meta: meta
          ? defined({
              primary_text: str(meta.primary_text),
              headline: str(meta.headline),
              cta: str(meta.cta),
              asset_ids: strArr(meta.asset_ids),
            })
          : undefined,
        google: google
          ? defined({ headlines: strArr(google.headlines), descriptions: strArr(google.descriptions) })
          : undefined,
        youtube: youtube
          ? defined({
              headline: str(youtube.headline),
              description: str(youtube.description),
              cta: str(youtube.cta),
              asset_ids: strArr(youtube.asset_ids),
            })
          : undefined,
        tiktok: tiktok
          ? defined({
              hook: str(tiktok.hook),
              script: str(tiktok.script),
              video_path: str(tiktok.video_path),
              cover_image_path: str(tiktok.cover_image_path),
              video_asset_id: str(tiktok.video_asset_id),
              cover_asset_id: str(tiktok.cover_asset_id),
            })
          : undefined,
        x: x ? defined({ post: str(x.post), asset_ids: strArr(x.asset_ids) }) : undefined,
      })
    : undefined;

  return defined({
    hook: str(c.hook),
    pillars: strArr(c.pillars),
    tone: str(c.tone),
    cta: str(c.cta),
    compliance_notes: str(c.compliance_notes),
    headline: str(c.headline),
    body: str(c.body),
    landing_page_url: str(c.landing_page_url),
    media: parseMedia(c.media),
    thumbnail_asset_id: str(c.thumbnail_asset_id),
    platforms,
  });
}

/** Clamp duration like the Tracker (1–90 days). */
export function clampDuration(days: unknown): number | undefined {
  if (days == null || !Number.isFinite(Number(days))) return undefined;
  return Math.max(1, Math.min(90, Math.round(Number(days))));
}

// ---------------------------------------------------------------------------
// age groups

export type AgeRange = { min: number; max: number };

function clampAge(n: number): number {
  return Math.min(65, Math.max(18, Math.round(n)));
}

export function parseAgeRange(raw: string | undefined | null): AgeRange | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const text = raw.replace(/[–—]/g, "-").replace(/\s+to\s+/gi, "-").trim();
  if (!text) return undefined;
  const range = text.match(/\b(1[8-9]|[2-6]\d)\s*-\s*(65\+|\+|[1-9]\d)/);
  const plus = text.match(/\b(1[8-9]|[2-6]\d)\s*\+/);
  let min: number;
  let max: number;
  if (range) {
    min = Number(range[1]);
    max = range[2] === "+" || range[2] === "65+" ? 65 : Number(range[2]);
  } else if (plus) {
    min = Number(plus[1]);
    max = 65;
  } else {
    return undefined;
  }
  min = clampAge(min);
  max = clampAge(max);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

export function formatAgeRange(range: AgeRange): string {
  if (range.min >= 65) return "65+";
  if (range.max >= 65) return `${range.min}-65+`;
  return `${range.min}-${range.max}`;
}

export function normalizeAgeGroup(raw: string | undefined | null): string | undefined {
  const parsed = parseAgeRange(raw);
  return parsed ? formatAgeRange(parsed) : undefined;
}

/** Every adult — what Siasa ads target, since the Siasa composer has no age field. */
export const ALL_ADULTS_AGE_GROUP = "18-65+";

// ---------------------------------------------------------------------------
// locations

export function formatLocationLabel(parts: { county?: string; constituency?: string; ward?: string; name?: string }): string {
  const chain = [parts.county, parts.constituency, parts.ward].filter(
    (p): p is string => Boolean(p && String(p).trim())
  );
  if (chain.length) return chain.join(" > ");
  return parts.name?.trim() || "Kenya";
}

/** Read "County > Constituency > Ward" back into parts. */
export function parseLocationLabel(label: string): { county?: string; constituency?: string; ward?: string } {
  const parts = label.split(">").map((p) => p.trim()).filter(Boolean);
  if (!parts.length || (parts.length === 1 && parts[0].toLowerCase() === "kenya")) return {};
  return { county: parts[0], constituency: parts[1], ward: parts[2] };
}

export function parseLocationSelections(metadata: unknown): AdlyLocationSelection[] {
  const raw = obj(metadata).location_selections;
  if (!Array.isArray(raw)) return [];
  const out: AdlyLocationSelection[] = [];
  for (const item of raw) {
    const o = obj(item);
    const label = str(o.label);
    if (!label) continue;
    const source =
      o.source === "hierarchy" || o.source === "osm" || o.source === "agent" || o.source === "national"
        ? o.source
        : "hierarchy";
    out.push(
      defined({
        county: str(o.county),
        constituency: str(o.constituency),
        ward: str(o.ward),
        label,
        source,
        osmId: str(o.osmId),
      })
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// campaign scope (manifesto vs project)

export type AdlyCampaignScope = {
  campaign_type: "manifesto" | "project";
  project_id: string | null;
  project_title: string | null;
};

export function parseCampaignScope(metadata: unknown): AdlyCampaignScope {
  const m = obj(metadata);
  const type = typeof m.campaign_type === "string" ? m.campaign_type.toLowerCase() : "";
  if (type !== "project") return { campaign_type: "manifesto", project_id: null, project_title: null };
  const project_id = str(m.project_id)?.trim() ?? null;
  const project_title = project_id ? str(m.project_title)?.trim() ?? null : null;
  return { campaign_type: "project", project_id, project_title };
}

export function withCampaignScope(
  metadata: Record<string, unknown>,
  scope: AdlyCampaignScope
): Record<string, unknown> {
  const base = { ...metadata };
  if (scope.campaign_type === "manifesto" || !scope.project_id) {
    base.campaign_type = scope.campaign_type;
    delete base.project_id;
    delete base.project_title;
    return base;
  }
  base.campaign_type = "project";
  base.project_id = scope.project_id;
  if (scope.project_title) base.project_title = scope.project_title;
  else delete base.project_title;
  return base;
}

// ---------------------------------------------------------------------------
// channels and budget

/** Networks the Tracker can publish to live today (Tracker LIVE_AD_CHANNELS). */
export const LIVE_CHANNELS: readonly TrackerChannel[] = ["google", "x"];

export function normalizeChannel(raw: string): TrackerChannel | null {
  const c = raw.trim().toLowerCase();
  if (c === "twitter") return "x";
  return (["google", "youtube", "meta", "tiktok", "x"] as const).find((v) => v === c) ?? null;
}

/** Plan channels that can be published live, deduplicated, in plan order. */
export function resolvePublishChannels(channels: readonly string[] | null | undefined): TrackerChannel[] {
  const out: TrackerChannel[] = [];
  for (const raw of channels ?? []) {
    const ch = normalizeChannel(raw);
    if (ch && LIVE_CHANNELS.includes(ch) && !out.includes(ch)) out.push(ch);
  }
  return out;
}

/** Split the pooled budget; the remainder goes to the first channels so shares sum to the total. */
export function splitBudgetAcrossChannels(
  budgetKes: number,
  channels: readonly TrackerChannel[]
): Partial<Record<TrackerChannel, number>> {
  const shares: Partial<Record<TrackerChannel, number>> = {};
  if (!channels.length) return shares;
  const total = Math.max(0, Math.round(Number(budgetKes) || 0));
  const base = Math.floor(total / channels.length);
  let remainder = total - base * channels.length;
  for (const ch of channels) {
    shares[ch] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return shares;
}

/** Tracker platform fee taken from the client budget on each live submit. */
export const ADLY_PLATFORM_FEE_RATE = 0.20;

export function mediaBudgetKes(clientBudgetKes: number): number {
  const gross = Math.max(0, Math.round(Number(clientBudgetKes) || 0));
  if (gross <= 0) return 0;
  return Math.max(1, Math.round(gross * (1 - ADLY_PLATFORM_FEE_RATE)));
}

export function platformFeeKes(clientBudgetKes: number): number {
  const gross = Math.max(0, Math.round(Number(clientBudgetKes) || 0));
  return Math.max(0, gross - mediaBudgetKes(gross));
}

/** KES per USD the Google edge function uses to convert budgets. */
export const TRACKER_KES_PER_USD = 134;

// ---------------------------------------------------------------------------
// normalized plan

export interface NormalizedPlan {
  budgetKes: number;
  locations: string[];
  ageGroup: string;
  interests: string[];
  durationDays: number;
  headline: string;
  body: string;
  channels: string[];
}

/** Defaults are the Tracker's (KES 5,000, Kenya, 25-34, 14 days). */
export function normalizePlan(row: Pick<AdlyCampaignRow, "name" | "budget" | "channels" | "targeting" | "creative">): NormalizedPlan {
  const t = obj(row.targeting);
  const creative = parseCreative(row.creative);
  const locations = strArr(t.locations) ?? ["Kenya"];
  const rawAge = typeof t.age_group === "string" ? t.age_group : undefined;
  const interests = Array.isArray(t.interests)
    ? t.interests.filter((x): x is string => typeof x === "string")
    : [];
  // The 5000 default is only for a plan that has no budget at all (a brand-new
  // row). A stored 0 stays 0, so a round-trip save never turns it into 5000.
  const noBudget = row.budget === null || row.budget === undefined || String(row.budget).trim() === "";
  const budget = Math.max(0, num(row.budget));
  return {
    budgetKes: noBudget ? 5000 : budget,
    locations,
    ageGroup: normalizeAgeGroup(rawAge) || rawAge || "25-34",
    interests: interests.length ? interests : ["civic engagement"],
    durationDays: clampDuration(t.duration_days) ?? 14,
    headline: creative.headline || row.name,
    body: creative.body || "",
    channels: (row.channels ?? []).map((c) => c.toLowerCase()),
  };
}

// ---------------------------------------------------------------------------
// landing page

export const TRACKER_PUBLIC_ORIGIN = "https://m-taji.co.ke";

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  );
}

/** True for an http(s) URL with a public host the networks accept. */
export function isAdNetworkLandingUrl(value: string | null | undefined): boolean {
  try {
    const u = new URL((value ?? "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return !isLocalHost(host) && host.includes(".");
  } catch {
    return false;
  }
}

/**
 * Same order as the Tracker: creative.landing_page_url, else the project page
 * (campaign_type project), else the owner's profile. `siteOrigin` is the public
 * site that serves those paths.
 */
export function buildLandingPageUrl(
  row: Pick<AdlyCampaignRow, "user_id" | "creative" | "metadata">,
  siteOrigin: string = TRACKER_PUBLIC_ORIGIN
): string {
  const origin = isAdNetworkLandingUrl(siteOrigin) ? siteOrigin.replace(/\/$/, "") : TRACKER_PUBLIC_ORIGIN;
  const preferred = parseCreative(row.creative).landing_page_url;
  if (preferred && isAdNetworkLandingUrl(preferred)) return preferred.trim();
  if (preferred) {
    try {
      const u = new URL(preferred, origin);
      return `${origin}${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
    } catch {
      // fall through
    }
  }
  const scope = parseCampaignScope(row.metadata);
  if (scope.campaign_type === "project" && scope.project_id) return `${origin}/projects/${scope.project_id}`;
  return row.user_id ? `${origin}/profile/${row.user_id}` : origin;
}

// ---------------------------------------------------------------------------
// publish payloads

/** Google keyword text: split lists, strip symbols, keep short phrases (max 10). */
export function sanitizeGoogleKeywords(raw: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw ?? []) {
    if (typeof entry !== "string") continue;
    for (const part of entry.split(/[,;|/]+/)) {
      const cleaned = part
        .replace(/[^\p{L}\p{N}\s\- '&]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      if (cleaned.length < 2 || cleaned.split(" ").filter(Boolean).length > 6) continue;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
      if (out.length >= 10) return out;
    }
  }
  return out;
}

export function assignedImagePaths(creative: AdlyCreativeJson, assetIds: string[] | undefined): string[] {
  const media = creative.media ?? [];
  return (assetIds ?? [])
    .map((id) => media.find((a) => a.id === id && a.kind === "image")?.path)
    .filter((p): p is string => Boolean(p));
}

type PlanRow = Pick<AdlyCampaignRow, "id" | "user_id" | "name" | "objective" | "budget" | "channels" | "targeting" | "creative" | "metadata">;

/** Body for create-google-ads-campaign-rest. `budgetKes` is this channel's share of the client budget. */
export function buildGooglePublishPayload(row: PlanRow, budgetKes: number, siteOrigin?: string, now = new Date()) {
  const plan = normalizePlan({ ...row, budget: budgetKes });
  const creative = parseCreative(row.creative);
  const google = creative.platforms?.google;
  const end = new Date(now.getTime() + plan.durationDays * 86_400_000);
  const interests = sanitizeGoogleKeywords([
    ...plan.interests,
    ...plan.locations.slice(0, 4),
    ...(google?.headlines ?? []).slice(0, 3),
    creative.headline ?? "",
    row.name ?? "",
  ]);
  return {
    campaign_id: row.id,
    recommendation_id: "",
    campaign_name: google?.headlines?.[0] || creative.headline || row.name,
    budget: mediaBudgetKes(plan.budgetKes),
    client_budget_kes: plan.budgetKes,
    platform_fee_kes: platformFeeKes(plan.budgetKes),
    target_location: plan.locations,
    target_age_group: plan.ageGroup,
    duration_start: now.toISOString(),
    duration_end: end.toISOString(),
    audience_interests: interests.slice(0, 8),
    property_ids: [] as string[],
    platforms: ["google"],
    objective: row.objective || "awareness",
    landing_page_url: buildLandingPageUrl(row, siteOrigin),
    google_headlines: google?.headlines ?? [],
    google_descriptions: google?.descriptions ?? [],
  };
}

/** Body for publish-x-ads. */
export function buildXPublishPayload(row: PlanRow, budgetKes: number, siteOrigin?: string) {
  const plan = normalizePlan({ ...row, budget: budgetKes });
  const creative = parseCreative(row.creative);
  const x = creative.platforms?.x;
  return {
    campaign_id: row.id,
    recommendation_id: "",
    headline: creative.headline || row.name,
    body_text: x?.post || creative.body || "",
    landing_page_url: buildLandingPageUrl(row, siteOrigin),
    budget_kes: mediaBudgetKes(plan.budgetKes),
    client_budget_kes: plan.budgetKes,
    platform_fee_kes: platformFeeKes(plan.budgetKes),
    target_locations: plan.locations,
    target_age_group: plan.ageGroup,
    duration_days: plan.durationDays,
    interests: plan.interests,
    objective: row.objective || "awareness",
    image_paths: assignedImagePaths(creative, x?.asset_ids),
  };
}

/** Edge function that publishes each channel. */
export const PUBLISH_FUNCTION: Record<TrackerChannel, string> = {
  google: "create-google-ads-campaign-rest",
  youtube: "publish-youtube-ads",
  meta: "publish-meta-ads",
  tiktok: "publish-tiktok-ads",
  x: "publish-x-ads",
};

/** metadata key the publish functions stamp once a channel is live (republish = update). */
export const PROVIDER_CAMPAIGN_KEY: Record<TrackerChannel, string> = {
  google: "google_campaign_id",
  youtube: "youtube_campaign_id",
  meta: "meta_campaign_id",
  tiktok: "tiktok_campaign_id",
  x: "x_campaign_id",
};
