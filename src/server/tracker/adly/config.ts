/**
 * Siasa-side ad settings on the Tracker backend. Network credentials are not
 * here: they are Supabase function secrets (GADS_*, X_*, META_*, TIKTOK_*,
 * OPENAI_API_KEY) read by the Tracker edge functions.
 *
 * Same .env names as the legacy src/server/ads/config.ts so deployments keep working.
 */
export function trackerAdSettings() {
  const number = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    reachPerKes: number("AD_REACH_PER_KES", 10),
    minBudgetKes: number("AD_MIN_BUDGET_KES", 500),
    maxBudgetKes: number("AD_MAX_BUDGET_KES", 500_000),
    /** Admin approves in Siasa before the owner can publish. */
    requireApproval: process.env.ADS_REQUIRE_APPROVAL !== "false",
    /** Ask the edge functions for a dry run (audit row only, nothing created or charged). */
    dryRun: process.env.ADS_DRY_RUN === "true",
    siteUrl: (process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, ""),
  };
}

export const AD_LIMITS = {
  headline: 30,
  body: 220,
  keywords: 20,
  keywordLength: 80,
  minDays: 1,
  maxDays: 30,
} as const;
