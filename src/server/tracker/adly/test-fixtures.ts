/**
 * Test fixtures shaped like live adly_campaigns / ad_channel_stats rows in the
 * Tracker (keys and value shapes sampled from the live project; ids and copy
 * are made up, no personal data).
 */
import type { AdChannelStatRow, AdlyCampaignRow, AdRecommendationRow } from "@/server/tracker/adly/rows";

export const OWNER = "0b6f1c2e-4d3a-4e8b-9a71-2f5c8d9e1a10";

/** Created and published from the Tracker wizard: X live, Google planned. */
export const trackerLiveRow: AdlyCampaignRow = {
  id: "5a1d7c3e-8f20-4b6a-9c11-3e2d4f5a6b70",
  user_id: OWNER,
  name: "Kondele water access",
  objective: "awareness",
  status: "live",
  budget: "600",
  budget_daily: "357",
  channels: ["google", "x"],
  targeting: {
    locations: ["Kisumu > Kisumu Central > Kondele", "Nairobi"],
    age_group: "25-34",
    interests: ["civic engagement", "water access"],
    duration_days: 14,
  },
  creative: {
    hook: "Clean water, closer to home",
    tone: "Hopeful and accountable",
    pillars: ["water: 3 new kiosks"],
    cta: "See the progress",
    headline: "Water kiosks for Kondele",
    body: "Three new kiosks now serve 4,000 households. See where the work is.",
    media: [
      { id: "m1", path: `${OWNER}/5a1d7c3e-8f20-4b6a-9c11-3e2d4f5a6b70/kiosk.jpg`, kind: "image", filename: "kiosk.jpg", bytes: 120334, contentType: "image/jpeg" },
      { id: "m2", path: `${OWNER}/5a1d7c3e-8f20-4b6a-9c11-3e2d4f5a6b70/clip.mp4`, kind: "video", filename: "clip.mp4" },
    ],
    thumbnail_asset_id: "m1",
    platforms: {
      x: { post: "Three new water kiosks in Kondele. See the work.", asset_ids: ["m1"] },
      google: { headlines: ["Kondele water kiosks", "Clean water nearby"], descriptions: ["3 kiosks serving 4,000 homes."] },
      meta: { primary_text: "Clean water, closer to home", headline: "Kondele water", cta: "Learn more" },
      tiktok: { hook: "Water in 2 minutes", script: "..." },
    },
  },
  metadata: {
    wizard: { mode: "chat", step: "review", applied: { targeting: true, platformsCreative: true }, visited: ["chat", "targeting"], packageReady: { targeting: true, platforms: true, creative: true }, pendingSuggestionIds: {} },
    brief_source: "adly",
    campaign_type: "project",
    project_id: "9c0e7d6b-1a2f-4c3d-8e9f-0a1b2c3d4e5f",
    project_title: "Kondele water kiosks",
    location_selections: [
      { county: "Kisumu", constituency: "Kisumu Central", ward: "Kondele", label: "Kisumu > Kisumu Central > Kondele", source: "hierarchy" },
      { county: "Nairobi", label: "Nairobi", source: "hierarchy" },
    ],
    suggested_channels: ["x", "google"],
    suggested_locations: ["Kisumu"],
    x_campaign_id: "1x2y3z",
    x_line_item_id: "li-77",
    x_tweet_id: "180000000000",
    x_stub: false,
    last_publish_at: "2026-10-10T08:00:00.000Z",
    last_insights_sync_at: "2026-10-11T08:00:00.000Z",
    last_insights_errors: [{ provider: "google", error: "No google_campaign_id in metadata yet" }],
    chat_docs: [],
  },
  created_at: "2026-10-09T12:00:00.000Z",
  updated_at: "2026-10-11T08:00:00.000Z",
};

export const trackerLiveStats: AdChannelStatRow[] = [
  { campaign_id: trackerLiveRow.id, provider: "x", impressions: "1500", clicks: "45", spend_kes: "120.5", approval_status: "active", provider_campaign_id: "1x2y3z", synced_at: "2026-10-11T08:00:00.000Z", raw: {} },
  { campaign_id: trackerLiveRow.id, provider: "google", impressions: 0, clicks: 0, spend_kes: 0, approval_status: "not_published", provider_campaign_id: null, synced_at: "2026-10-11T08:00:00.000Z", raw: {} },
];

/** A fresh Tracker draft with the Tracker's defaults. */
export const trackerDraftRow: AdlyCampaignRow = {
  id: "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918",
  user_id: OWNER,
  name: "New campaign",
  objective: "awareness",
  status: "draft",
  budget: "5000",
  budget_daily: "357",
  channels: [],
  targeting: { locations: ["Kenya"], age_group: "25-34", interests: ["civic engagement"], duration_days: 14 },
  creative: {},
  metadata: {},
  created_at: "2026-10-20T09:30:00.000Z",
  updated_at: "2026-10-20T09:30:00.000Z",
};

export const recommendationRow: AdRecommendationRow = {
  id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
  campaign_id: trackerLiveRow.id,
  channel: "google",
  headline: "Add Kisumu town to targeting",
  body: "Most clicks come from Kisumu Central; widen to the whole county.",
  status: "pending",
  created_at: "2026-10-11T09:00:00.000Z",
  metadata: { kind: "targeting" },
};
