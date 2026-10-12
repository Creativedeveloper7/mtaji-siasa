import type { AdPlatform } from "@/types";

/** Pricing and behaviour for paid ads. All values come from .env with safe defaults. */
export function adSettings() {
  const number = (name: string, fallback: number) => {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    kesPerUsd: number("AD_KES_PER_USD", 129),
    reachPerKes: number("AD_REACH_PER_KES", 10),
    minBudgetKes: number("AD_MIN_BUDGET_KES", 500),
    maxBudgetKes: number("AD_MAX_BUDGET_KES", 500_000),
    requireApproval: process.env.ADS_REQUIRE_APPROVAL !== "false",
    /** Validate on the networks without creating anything (Google validateOnly, X read-only checks). */
    dryRun: process.env.ADS_DRY_RUN === "true",
    siteUrl: (process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, ""),
  };
}

export function xConfig() {
  const keys = {
    apiKey: process.env.X_API_KEY ?? "",
    apiSecret: process.env.X_API_SECRET ?? "",
    accessToken: process.env.X_ACCESS_TOKEN ?? "",
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET ?? "",
    accountId: process.env.X_ADS_ACCOUNT_ID ?? "",
    fundingInstrumentId: process.env.X_FUNDING_INSTRUMENT_ID ?? "",
  };
  return { ...keys, configured: Object.values(keys).every(Boolean) };
}

export function googleConfig() {
  const keys = {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
    customerId: (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/-/g, ""),
  };
  return {
    ...keys,
    loginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "").replace(/-/g, ""),
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || "v22",
    configured: Object.values(keys).every(Boolean),
  };
}

export function platformConfigured(platform: AdPlatform): boolean {
  return platform === "x" ? xConfig().configured : googleConfig().configured;
}

/** Kenya, used for location targeting on both networks. */
export const KENYA = { x: "17ad6a68301cd28b", google: "geoTargetConstants/2404" } as const;
