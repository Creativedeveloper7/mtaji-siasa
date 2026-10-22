import { describe, expect, it } from "vitest";
import type { Campaign } from "@/types/adly";
import {
  adComposerToRow,
  campaignToRow,
  channelsToPlatformIds,
  creativeIdFor,
  creativeToRow,
  fromTrackerStatus,
  insightErrorsToInsights,
  isPublishedTo,
  platformIdsToChannels,
  readSiasaMeta,
  recommendationToInsight,
  rowToAdCampaign,
  rowToCampaign,
  rowToCreative,
  statsToPerformance,
  toAdCampaignStatus,
  withSiasaMeta,
} from "@/server/tracker/adly/mapping";
import { parseCreative } from "@/server/tracker/adly/plan";
import type { AdlyCampaignRow } from "@/server/tracker/adly/rows";
import {
  OWNER,
  recommendationRow,
  trackerDraftRow,
  trackerLiveRow,
  trackerLiveStats,
} from "@/server/tracker/adly/test-fixtures";

describe("row -> Siasa Campaign", () => {
  it("maps a live Tracker campaign", () => {
    const c = rowToCampaign(trackerLiveRow, { stats: trackerLiveStats, fallbackLeaderId: "pf-1" });
    expect(c.id).toBe(trackerLiveRow.id);
    expect(c.status).toBe("active");
    expect(c.objective).toBe("awareness");
    expect(c.platformIds).toEqual(["google", "x"]);
    expect(c.leaderId).toBe("pf-1");
    expect(c.projectId).toBe("9c0e7d6b-1a2f-4c3d-8e9f-0a1b2c3d4e5f");
    expect(c.targeting).toEqual({ country: "Kenya", county: "Kisumu", constituency: "Kisumu Central", ward: "Kondele" });
    expect(c.budget).toBe(600);
    expect(c.startDate).toBe("2026-10-10");
    expect(c.endDate).toBe("2026-10-23"); // 14 days inclusive
    expect(c.creativeIds).toEqual([creativeIdFor(trackerLiveRow.id)]);
    expect(c.performance).toEqual({
      spend: 120.5,
      reach: 0,
      impressions: 1500,
      engagement: 45,
      ctr: 3,
      conversions: 0,
      currency: "KES",
    });
  });

  it("maps a Tracker default draft", () => {
    const c = rowToCampaign(trackerDraftRow);
    expect(c.status).toBe("draft");
    expect(c.platformIds).toEqual([]);
    expect(c.targeting).toEqual({ country: "Kenya" });
    expect(c.creativeIds).toEqual([]);
    expect(c.projectId).toBeUndefined();
    expect(rowToCreative(trackerDraftRow)).toBeNull();
  });

  it("reads the Siasa review as in-review", () => {
    const row = { ...trackerDraftRow, metadata: withSiasaMeta({}, { review: { state: "pending", at: "x" } }) };
    expect(fromTrackerStatus(row)).toBe("in-review");
    expect(fromTrackerStatus({ ...row, status: "archived" })).toBe("completed");
  });

  it("builds the creative with the thumbnail URL passed in", () => {
    const cr = rowToCreative(trackerLiveRow, { imageUrl: "https://signed.example/kiosk.jpg" });
    expect(cr).toMatchObject({
      id: creativeIdFor(trackerLiveRow.id),
      headline: "Water kiosks for Kondele",
      cta: "See the progress",
      image: "https://signed.example/kiosk.jpg",
      platformIds: ["google", "x"],
    });
  });
});

describe("Siasa Campaign -> row", () => {
  const campaign: Campaign = {
    id: "cmp_local",
    slug: "roads",
    name: "Githurai roads",
    objective: "project-visibility",
    status: "in-review",
    platformIds: ["google", "x", "instagram", "facebook"],
    leaderId: "pf-9",
    projectId: "proj-1",
    targeting: { country: "Kenya", county: "Kiambu", constituency: "Ruiru", ward: "Githurai" },
    startDate: "2026-11-01",
    endDate: "2026-11-10",
    budget: 20000,
    currency: "KES",
    creativeIds: [],
    performance: { spend: 0, reach: 0, impressions: 0, engagement: 0, ctr: 0, conversions: 0, currency: "KES" },
    createdAt: "2026-10-22T00:00:00.000Z",
  };

  it("writes Tracker-shaped columns for a new row", () => {
    const w = campaignToRow(campaign, null);
    expect(w.status).toBe("draft");
    expect(w.objective).toBe("awareness");
    expect(w.channels).toEqual(["google", "x", "meta"]);
    expect(w.budget).toBe(20000);
    expect(w.budget_daily).toBe(2000);
    expect(w.creative).toEqual({});
    expect(w.targeting).toEqual({
      locations: ["Kiambu > Ruiru > Githurai"],
      age_group: "18-65+",
      interests: ["civic engagement"],
      duration_days: 10,
    });
    const meta = w.metadata!;
    expect(meta.campaign_type).toBe("project");
    expect(meta.project_id).toBe("proj-1");
    expect(meta.location_selections).toEqual([
      { county: "Kiambu", constituency: "Ruiru", ward: "Githurai", label: "Kiambu > Ruiru > Githurai", source: "hierarchy" },
    ]);
    const siasa = readSiasaMeta(meta);
    expect(siasa.leader_id).toBe("pf-9");
    expect(siasa.objective).toBe("project-visibility");
    expect(siasa.review?.state).toBe("pending");
  });

  it("round-trips through the row", () => {
    const w = campaignToRow(campaign, null);
    const row: AdlyCampaignRow = { ...trackerDraftRow, ...w, id: trackerDraftRow.id } as AdlyCampaignRow;
    const back = rowToCampaign(row);
    expect(back).toMatchObject({
      name: "Githurai roads",
      objective: "project-visibility",
      status: "in-review",
      platformIds: ["google", "x", "meta"],
      leaderId: "pf-9",
      projectId: "proj-1",
      targeting: { country: "Kenya", county: "Kiambu", constituency: "Ruiru", ward: "Githurai" },
      startDate: "2026-11-01",
      endDate: "2026-11-10",
      budget: 20000,
    });
  });

  it("merges into an existing Tracker row without dropping its keys", () => {
    const w = campaignToRow({ ...campaign, status: "active" }, { ...trackerLiveRow, channels: ["google", "x", "youtube"] });
    expect(w.status).toBeUndefined(); // publishing owns live states
    expect(w.channels).toEqual(["google", "x", "meta", "youtube"]);
    expect(w.creative).toBeUndefined(); // creative untouched
    const meta = w.metadata!;
    expect(meta.wizard).toEqual(trackerLiveRow.metadata!.wizard);
    expect(meta.x_campaign_id).toBe("1x2y3z");
    expect(meta.chat_docs).toEqual([]);
    expect((w.targeting as Record<string, unknown>).age_group).toBe("25-34");
    // Area unchanged from the row's first selection? Here it changed, so it is rewritten.
    expect((w.targeting as Record<string, unknown>).locations).toEqual(["Kiambu > Ruiru > Githurai"]);
    expect((w.targeting as Record<string, unknown>).interests).toEqual(["civic engagement", "water access"]);
  });

  it("keeps every Tracker location when the area is unchanged", () => {
    const asSiasa = rowToCampaign(trackerLiveRow);
    const w = campaignToRow({ ...asSiasa, name: "Renamed" }, trackerLiveRow);
    expect((w.targeting as Record<string, unknown>).locations).toEqual(["Kisumu > Kisumu Central > Kondele", "Nairobi"]);
    expect(w.metadata!.location_selections).toEqual(trackerLiveRow.metadata!.location_selections);
    expect(w.name).toBe("Renamed");
    expect((w.targeting as Record<string, unknown>).duration_days).toBe(14); // no drift on round trip
  });

  it("merges a Siasa creative into the stored creative jsonb", () => {
    const w = creativeToRow(
      {
        id: creativeIdFor(trackerLiveRow.id),
        name: "x",
        headline: "New headline",
        body: "New body text",
        cta: "Read more",
        image: "https://cdn.example/new.jpg",
        platformIds: ["google"],
      },
      trackerLiveRow
    );
    const creative = parseCreative(w.creative);
    expect(creative.headline).toBe("New headline");
    expect(creative.media).toHaveLength(2);
    expect(creative.thumbnail_asset_id).toBe("m1");
    expect(creative.platforms?.tiktok?.hook).toBe("Water in 2 minutes");
    expect(creative.platforms?.google?.headlines?.[0]).toBe("New headline");
    expect(creative.platforms?.google?.headlines).toContain("Kondele water kiosks");
    expect(creative.platforms?.x).toEqual({ post: "New body text", asset_ids: ["m1"] });
    expect(readSiasaMeta(w.metadata).image_url).toBe("https://cdn.example/new.jpg");
    expect(w.metadata!.x_campaign_id).toBe("1x2y3z");
  });
});

describe("paid ads (AdCampaign)", () => {
  it("maps a live row with per-network runs", () => {
    const ad = rowToAdCampaign(trackerLiveRow, { stats: trackerLiveStats, fallbackLeaderId: "pf-1" });
    expect(ad.status).toBe("active");
    expect(ad.budgetKes).toBe(600);
    expect(ad.durationDays).toBe(14);
    expect(ad.keywords).toEqual(["civic engagement", "water access"]);
    expect(ad.refundedKes).toBe(0);
    expect(ad.startDate).toBe("2026-10-10T08:00:00.000Z");
    expect(ad.platforms).toEqual([
      {
        platform: "google",
        budgetKes: 300,
        status: "pending",
        error: "No google_campaign_id in metadata yet",
        impressions: 0,
        clicks: 0,
        spentKes: 0,
        syncedAt: "2026-10-11T08:00:00.000Z",
      },
      {
        platform: "x",
        budgetKes: 300,
        status: "live",
        externalIds: { x_campaign_id: "1x2y3z", x_line_item_id: "li-77", x_tweet_id: "180000000000" },
        impressions: 1500,
        clicks: 45,
        spentKes: 120.5,
        syncedAt: "2026-10-11T08:00:00.000Z",
      },
    ]);
    expect(isPublishedTo(trackerLiveRow, "x")).toBe(true);
    expect(isPublishedTo(trackerLiveRow, "google")).toBe(false);
  });

  it("follows the approval gate on drafts", () => {
    const at = "2026-10-22T10:00:00.000Z";
    const pending = { ...trackerDraftRow, metadata: withSiasaMeta({}, { review: { state: "pending", at } }) };
    expect(toAdCampaignStatus(pending)).toBe("pending_approval");
    const approved = { ...pending, metadata: withSiasaMeta(pending.metadata, { review: { state: "approved", at } }) };
    expect(toAdCampaignStatus(approved)).toBe("launching");
    const rejected = { ...pending, metadata: withSiasaMeta(pending.metadata, { review: { state: "rejected", at, note: "Wrong county" } }) };
    expect(toAdCampaignStatus(rejected)).toBe("rejected");
    expect(rowToAdCampaign(rejected).statusNote).toBe("Not approved: Wrong county. Nothing was charged.");
    expect(toAdCampaignStatus({ ...pending, status: "archived", metadata: withSiasaMeta({}, { review: { state: "cancelled", at } }) })).toBe("rejected");
    expect(toAdCampaignStatus({ ...trackerDraftRow, status: "archived" })).toBe("stopped");
    expect(toAdCampaignStatus({ ...trackerDraftRow, status: "failed" })).toBe("failed");
  });

  it("writes the composer into a Tracker row and reads it back", () => {
    const w = adComposerToRow(
      {
        name: "Ruiru bypass — ad",
        headline: "Ruiru bypass is open",
        body: "The 12 km bypass cuts the commute by 40 minutes. See the project.",
        keywords: ["Ruiru", "Kiambu County"],
        platforms: ["x", "google"],
        budgetKes: 2500,
        durationDays: 5,
        landingUrl: "https://mtajisiasa.co.ke/projects/ruiru-bypass",
        imageUrl: "https://cdn.example/bypass.jpg",
        projectId: "proj-ruiru",
        projectTitle: "Ruiru bypass",
        leaderId: "pf-2",
        estimatedReach: 25000,
        requireApproval: true,
      },
      OWNER,
      new Date("2026-10-22T10:00:00.000Z")
    );
    expect(w).toMatchObject({
      user_id: OWNER,
      status: "draft",
      budget: 2500,
      budget_daily: 500,
      channels: ["x", "google"],
      targeting: { locations: ["Kenya"], age_group: "18-65+", interests: ["Ruiru", "Kiambu County"], duration_days: 5 },
    });
    expect(parseCreative(w.creative)).toMatchObject({
      headline: "Ruiru bypass is open",
      landing_page_url: "https://mtajisiasa.co.ke/projects/ruiru-bypass",
      platforms: { google: { headlines: ["Ruiru bypass is open"] }, x: { post: w.creative!.body } },
    });
    const row = { ...trackerDraftRow, ...w } as AdlyCampaignRow;
    const ad = rowToAdCampaign(row);
    expect(ad).toMatchObject({
      leaderId: "pf-2",
      projectId: "proj-ruiru",
      headline: "Ruiru bypass is open",
      imageUrl: "https://cdn.example/bypass.jpg",
      landingUrl: "https://mtajisiasa.co.ke/projects/ruiru-bypass",
      keywords: ["Ruiru", "Kiambu County"],
      budgetKes: 2500,
      durationDays: 5,
      estimatedReach: 25000,
      status: "pending_approval",
    });
    // Order is the plan's channel order; the budget splits evenly.
    expect(ad.platforms.map((p) => [p.platform, p.budgetKes, p.status])).toEqual([
      ["x", 1250, "pending"],
      ["google", 1250, "pending"],
    ]);
  });
});

describe("helpers", () => {
  it("maps platform ids to channels and back", () => {
    expect(platformIdsToChannels(["whatsapp", "instagram", "x", "tiktok"])).toEqual(["meta", "x", "tiktok"]);
    expect(channelsToPlatformIds(["Twitter", "youtube", "google", "meta"])).toEqual(["x", "google", "meta"]);
  });

  it("sums performance from string numerics", () => {
    expect(statsToPerformance([]).ctr).toBe(0);
    expect(statsToPerformance(trackerLiveStats).spend).toBe(120.5);
  });

  it("turns recommendations and sync errors into insights", () => {
    expect(recommendationToInsight(recommendationRow, trackerLiveRow.id)).toEqual({
      id: recommendationRow.id,
      tone: "neutral",
      title: "Add Kisumu town to targeting",
      body: "Most clicks come from Kisumu Central; widen to the whole county.",
      relatedCampaignId: trackerLiveRow.id,
    });
    expect(insightErrorsToInsights(trackerLiveRow)).toEqual([
      {
        id: `${trackerLiveRow.id}:sync:0`,
        tone: "attention",
        title: "Google results could not be refreshed",
        body: "No google_campaign_id in metadata yet",
        relatedCampaignId: trackerLiveRow.id,
      },
    ]);
  });

  it("keeps other metadata when writing metadata.siasa", () => {
    const next = withSiasaMeta(trackerLiveRow.metadata, { leader_id: "pf-3" });
    expect(next.x_campaign_id).toBe("1x2y3z");
    expect(readSiasaMeta(next).leader_id).toBe("pf-3");
    expect(readSiasaMeta(withSiasaMeta(next, { leader_id: undefined })).leader_id).toBeUndefined();
  });
});

describe("paid-ads listing", () => {
  it("lists composer ads, reviewed plans and published campaigns only", async () => {
    const { isPaidAdsRow } = await import("@/server/tracker/adly/mapping");
    expect(isPaidAdsRow(trackerLiveRow)).toBe(true);
    expect(isPaidAdsRow(trackerDraftRow)).toBe(false);
    expect(isPaidAdsRow({ ...trackerDraftRow, metadata: withSiasaMeta({}, { source: "ads" }) })).toBe(true);
    expect(isPaidAdsRow({ ...trackerDraftRow, status: "archived" })).toBe(false);
  });

  it("marks composer ads approved when no approval is required", () => {
    const w = adComposerToRow(
      { name: "n", headline: "h", body: "b", keywords: ["k"], platforms: ["x"], budgetKes: 500, durationDays: 1, landingUrl: "", imageUrl: "", projectId: "p", projectTitle: "t", leaderId: "l", estimatedReach: 1, requireApproval: false },
      OWNER
    );
    expect(toAdCampaignStatus({ status: "draft", metadata: w.metadata! })).toBe("launching");
  });
});

describe("publish audit on runs", () => {
  it("marks a network failed from its last audit and shows the error", () => {
    const ad = rowToAdCampaign(trackerLiveRow, {
      stats: trackerLiveStats,
      audits: [
        { campaign_id: trackerLiveRow.id, provider: "google", status: "failed", response_payload: { error: "INVALID_ARGUMENT: final_url" }, created_at: "2026-10-10T08:00:00.000Z" },
        { campaign_id: trackerLiveRow.id, provider: "x", status: "failed", response_payload: { error: "old" }, created_at: "2026-10-09T08:00:00.000Z" },
      ],
    });
    expect(ad.platforms.find((p) => p.platform === "google")).toMatchObject({ status: "failed", error: "INVALID_ARGUMENT: final_url" });
    // X is live on the network: an older failed attempt does not override it.
    expect(ad.platforms.find((p) => p.platform === "x")?.status).toBe("live");
  });

  it("explains a dry run", () => {
    const ad = rowToAdCampaign(trackerLiveRow, {
      stats: [],
      audits: [{ campaign_id: trackerLiveRow.id, provider: "google", status: "dry_run", response_payload: { message: "Missing secrets: GADS_DEV_TOKEN" }, created_at: "2026-10-10T08:00:00.000Z" }],
    });
    // live campaign without a google stat row reads as live by campaign status; a draft would read pending
    const draft = rowToAdCampaign({ ...trackerLiveRow, status: "draft" }, {
      audits: [{ campaign_id: trackerLiveRow.id, provider: "google", status: "dry_run", response_payload: { message: "Missing secrets: GADS_DEV_TOKEN" }, created_at: "2026-10-10T08:00:00.000Z" }],
    });
    expect(ad.platforms[0].status).toBe("live");
    expect(draft.platforms[0]).toMatchObject({ status: "pending", error: "Not live (dry run): Missing secrets: GADS_DEV_TOKEN" });
  });
});
