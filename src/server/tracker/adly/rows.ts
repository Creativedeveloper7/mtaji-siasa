/**
 * Row shapes of the Tracker's Adly tables (project jdddchjbglilkfrlenci).
 * Columns match supabase/migrations in the M-taji-Tracker repo.
 */

/** adly_campaigns.status check constraint. */
export const TRACKER_CAMPAIGN_STATUSES = [
  "draft",
  "live",
  "submitted",
  "paused",
  "completed",
  "archived",
  "failed",
] as const;
export type TrackerCampaignStatus = (typeof TRACKER_CAMPAIGN_STATUSES)[number];

/** Channels the Tracker plan and publish functions know about. */
export const TRACKER_CHANNELS = ["google", "youtube", "meta", "tiktok", "x"] as const;
export type TrackerChannel = (typeof TRACKER_CHANNELS)[number];

/** ad_channel_stats.provider check constraint (no youtube row). */
export type TrackerStatProvider = "google" | "meta" | "tiktok" | "x";

export interface AdlyCampaignRow {
  id: string;
  user_id: string;
  name: string;
  objective: string | null;
  status: string;
  budget: number | string | null;
  budget_daily: number | string | null;
  channels: string[] | null;
  targeting: Record<string, unknown> | null;
  creative: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
}

export const CAMPAIGN_COLUMNS =
  "id, user_id, name, objective, status, budget, budget_daily, channels, targeting, creative, metadata, created_at, updated_at";

export interface AdChannelStatRow {
  id?: string;
  campaign_id: string;
  provider: string;
  impressions: number | string | null;
  clicks: number | string | null;
  spend_kes: number | string | null;
  approval_status: string;
  provider_campaign_id?: string | null;
  synced_at?: string | null;
  raw?: Record<string, unknown> | null;
}

export const STAT_COLUMNS =
  "id, campaign_id, provider, impressions, clicks, spend_kes, approval_status, provider_campaign_id, synced_at, raw";

export interface AdCampaignMessageRow {
  id: string;
  campaign_id?: string;
  role: string;
  content: string;
  created_at: string;
}

export interface AdRecommendationRow {
  id: string;
  campaign_id?: string;
  channel: string;
  headline: string | null;
  body: string | null;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/** Latest ad_publish_audit row per provider (written by the publish functions). */
export interface AdPublishAuditRow {
  campaign_id: string;
  provider: string;
  status: string; // dry_run | success | failed | needs_creative | pending
  error?: string | null;
  response_payload?: Record<string, unknown> | null;
  created_at: string;
}

/** What one publish-* edge function call answered. */
export interface ChannelPublishResult {
  provider: TrackerChannel;
  ok: boolean;
  status?: string;
  error?: string;
  message?: string;
  /** Steps the network function reports as failed although it accepted the ad */
  issues?: string[];
  walletWarning?: string;
}
