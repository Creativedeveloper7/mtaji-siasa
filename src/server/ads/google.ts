import { KENYA, googleConfig } from "@/server/ads/config";

/**
 * Google Ads API (REST). One atomic googleAds:mutate creates the whole Display
 * campaign: two image assets, budget, campaign, Kenya targeting, ad group,
 * keywords and a responsive display ad. validateOnly runs every check without
 * creating anything.
 */
export class GoogleAdsError extends Error {}

const tokenCache = globalThis as typeof globalThis & {
  __mtajiGoogleToken?: { value: string; expires: number };
};

async function accessToken(): Promise<string> {
  const cached = tokenCache.__mtajiGoogleToken;
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const cfg = googleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new GoogleAdsError(`Google sign-in failed: ${data.error_description ?? response.status}`);
  }
  tokenCache.__mtajiGoogleToken = {
    value: data.access_token,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

/** Turn Google's nested error into one readable line. */
function describe(data: unknown, status: number): string {
  const error = (data as {
    error?: {
      message?: string;
      details?: { errors?: { message?: string; location?: { fieldPathElements?: { fieldName?: string }[] } }[] }[];
    };
  })?.error;
  const details = error?.details?.flatMap((d) => d.errors ?? []) ?? [];
  if (details.length) {
    return details
      .map((e) => {
        const field = e.location?.fieldPathElements?.map((p) => p.fieldName).filter(Boolean).join(".");
        return field ? `${e.message} (${field})` : e.message;
      })
      .join("; ");
  }
  return error?.message ?? `HTTP ${status}`;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const cfg = googleConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "developer-token": cfg.developerToken,
    "Content-Type": "application/json",
  };
  if (cfg.loginCustomerId) headers["login-customer-id"] = cfg.loginCustomerId;
  const response = await fetch(
    `https://googleads.googleapis.com/${cfg.apiVersion}/customers/${cfg.customerId}/${path}`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new GoogleAdsError(`Google Ads: ${describe(data, response.status)}`);
  return data as T;
}

const ymd = (date: Date) => date.toISOString().slice(0, 10);

export interface GoogleLaunchInput {
  name: string;
  headline: string; // <= 30
  longHeadline: string; // <= 90
  description: string; // <= 90
  businessName: string; // <= 25
  finalUrl: string;
  keywords: string[];
  landscape: Buffer;
  square: Buffer;
  totalUsd: number;
  days: number;
  start: Date;
  end: Date;
  validateOnly?: boolean;
}

export async function launchGoogle(input: GoogleLaunchInput): Promise<Record<string, string>> {
  const customer = `customers/${googleConfig().customerId}`;
  const temp = (kind: string, id: number) => `${customer}/${kind}/${id}`;
  const landscape = temp("assets", -1);
  const square = temp("assets", -2);
  const budget = temp("campaignBudgets", -3);
  const campaign = temp("campaigns", -4);
  const adGroup = temp("adGroups", -5);
  // Daily budget in micros; Google needs whole cents.
  const dailyMicros = String(Math.max(1, Math.round((input.totalUsd / input.days) * 100)) * 10_000);
  const suffix = ` ${Date.now().toString(36)}`;

  const operations = [
    {
      assetOperation: {
        create: {
          resourceName: landscape,
          name: `${input.name.slice(0, 80)} landscape${suffix}`,
          type: "IMAGE",
          imageAsset: { data: input.landscape.toString("base64") },
        },
      },
    },
    {
      assetOperation: {
        create: {
          resourceName: square,
          name: `${input.name.slice(0, 80)} square${suffix}`,
          type: "IMAGE",
          imageAsset: { data: input.square.toString("base64") },
        },
      },
    },
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budget,
          name: `${input.name.slice(0, 200)} budget${suffix}`,
          amountMicros: dailyMicros,
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaign,
          name: `${input.name.slice(0, 200)}${suffix}`,
          status: "ENABLED",
          advertisingChannelType: "DISPLAY",
          campaignBudget: budget,
          targetSpend: {},
          networkSettings: {
            targetGoogleSearch: false,
            targetSearchNetwork: false,
            targetContentNetwork: true,
            targetPartnerSearchNetwork: false,
          },
          startDate: ymd(input.start),
          endDate: ymd(input.end),
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        },
      },
    },
    {
      campaignCriterionOperation: {
        create: { campaign, location: { geoTargetConstant: KENYA.google } },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: adGroup,
          name: `${input.name.slice(0, 200)} ad group`,
          campaign,
          type: "DISPLAY_STANDARD",
          status: "ENABLED",
        },
      },
    },
    ...input.keywords.map((text) => ({
      adGroupCriterionOperation: {
        create: { adGroup, status: "ENABLED", keyword: { text: text.slice(0, 80), matchType: "BROAD" } },
      },
    })),
    {
      adGroupAdOperation: {
        create: {
          adGroup,
          status: "ENABLED",
          ad: {
            finalUrls: [input.finalUrl],
            responsiveDisplayAd: {
              headlines: [{ text: input.headline }],
              longHeadline: { text: input.longHeadline },
              descriptions: [{ text: input.description }],
              businessName: input.businessName,
              marketingImages: [{ asset: landscape }],
              squareMarketingImages: [{ asset: square }],
            },
          },
        },
      },
    },
  ];

  const result = await call<{
    mutateOperationResponses?: Record<string, { resourceName?: string }>[];
  }>("googleAds:mutate", { mutateOperations: operations, validateOnly: Boolean(input.validateOnly) });

  if (input.validateOnly) return { validated: "true" };
  const names = (result.mutateOperationResponses ?? []).flatMap((r) =>
    Object.values(r).map((v) => v?.resourceName ?? "")
  );
  const find = (kind: string) => names.find((n) => n.includes(`/${kind}/`)) ?? "";
  return {
    campaign: find("campaigns"),
    budget: find("campaignBudgets"),
    adGroup: find("adGroups"),
  };
}

export async function setGoogleStatus(ids: Record<string, string>, active: boolean): Promise<void> {
  if (!ids.campaign) return;
  await call("campaigns:mutate", {
    operations: [{ update: { resourceName: ids.campaign, status: active ? "ENABLED" : "PAUSED" }, updateMask: "status" }],
  });
}

export async function googleStats(
  ids: Record<string, string>
): Promise<{ impressions: number; clicks: number; spentUsd: number; status?: string }> {
  if (!ids.campaign) return { impressions: 0, clicks: 0, spentUsd: 0 };
  const result = await call<{
    results?: { campaign?: { status?: string }; metrics?: { impressions?: string; clicks?: string; costMicros?: string } }[];
  }>("googleAds:search", {
    query: `SELECT campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE campaign.resource_name = '${ids.campaign}'`,
  });
  const totals = { impressions: 0, clicks: 0, spentUsd: 0, status: undefined as string | undefined };
  for (const row of result.results ?? []) {
    totals.impressions += Number(row.metrics?.impressions ?? 0);
    totals.clicks += Number(row.metrics?.clicks ?? 0);
    totals.spentUsd += Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    totals.status = row.campaign?.status;
  }
  return totals;
}
