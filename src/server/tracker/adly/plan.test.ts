import { describe, expect, it } from "vitest";
import {
  buildGooglePublishPayload,
  buildLandingPageUrl,
  buildXPublishPayload,
  mediaBudgetKes,
  normalizePlan,
  parseAgeRange,
  parseCreative,
  platformFeeKes,
  resolvePublishChannels,
  sanitizeGoogleKeywords,
  splitBudgetAcrossChannels,
} from "@/server/tracker/adly/plan";
import { OWNER, trackerDraftRow, trackerLiveRow } from "@/server/tracker/adly/test-fixtures";

describe("plan", () => {
  it("normalizes with the Tracker defaults", () => {
    expect(normalizePlan({ ...trackerDraftRow, targeting: {}, budget: null })).toEqual({
      budgetKes: 5000,
      locations: ["Kenya"],
      ageGroup: "25-34",
      interests: ["civic engagement"],
      durationDays: 14,
      headline: "New campaign",
      body: "",
      channels: [],
    });
  });

  it("reads ages like the Tracker", () => {
    expect(parseAgeRange("18-65+")).toEqual({ min: 18, max: 65 });
    expect(parseAgeRange("22 to 55 years")).toEqual({ min: 22, max: 55 });
    expect(parseAgeRange("anyone")).toBeUndefined();
  });

  it("drops malformed media and keeps platform shapes", () => {
    const c = parseCreative({ media: [{ id: "a" }, { id: "b", path: "p", kind: "image", filename: "f" }], platforms: { x: { post: "hi" } } });
    expect(c.media).toEqual([{ id: "b", path: "p", kind: "image", filename: "f" }]);
    expect(c.platforms).toEqual({ x: { post: "hi" } });
  });

  it("splits budgets and applies the platform fee", () => {
    expect(splitBudgetAcrossChannels(601, ["google", "x"])).toEqual({ google: 301, x: 300 });
    expect(mediaBudgetKes(1000)).toBe(800);
    expect(platformFeeKes(1000)).toBe(200);
    expect(resolvePublishChannels(["meta", "Twitter", "google", "x", "tiktok"])).toEqual(["x", "google"]);
  });

  it("sanitizes Google keywords", () => {
    expect(sanitizeGoogleKeywords(["water, roads; Kisumu > Kondele", "a", "one two three four five six seven"])).toEqual([
      "water",
      "roads",
      "Kisumu Kondele",
    ]);
  });

  it("builds landing URLs in the Tracker order", () => {
    expect(buildLandingPageUrl({ user_id: OWNER, creative: { landing_page_url: "https://site.example/x" }, metadata: {} })).toBe(
      "https://site.example/x"
    );
    expect(buildLandingPageUrl(trackerLiveRow, "https://mtajisiasa.co.ke")).toBe(
      "https://mtajisiasa.co.ke/projects/9c0e7d6b-1a2f-4c3d-8e9f-0a1b2c3d4e5f"
    );
    expect(buildLandingPageUrl({ user_id: OWNER, creative: {}, metadata: {} }, "http://localhost:3000")).toBe(
      `https://m-taji.co.ke/profile/${OWNER}`
    );
    expect(buildLandingPageUrl({ user_id: OWNER, creative: { landing_page_url: "http://localhost:3000/projects/a" }, metadata: {} })).toBe(
      "https://m-taji.co.ke/projects/a"
    );
  });

  it("builds the Google publish body", () => {
    const now = new Date("2026-10-22T00:00:00.000Z");
    const body = buildGooglePublishPayload(trackerLiveRow, 300, "https://mtajisiasa.co.ke", now);
    expect(body).toMatchObject({
      campaign_id: trackerLiveRow.id,
      campaign_name: "Kondele water kiosks",
      budget: 240,
      client_budget_kes: 300,
      platform_fee_kes: 60,
      target_location: ["Kisumu > Kisumu Central > Kondele", "Nairobi"],
      target_age_group: "25-34",
      duration_start: "2026-10-22T00:00:00.000Z",
      duration_end: "2026-11-05T00:00:00.000Z",
      platforms: ["google"],
      google_headlines: ["Kondele water kiosks", "Clean water nearby"],
    });
    expect(body.audience_interests.length).toBeLessThanOrEqual(8);
    expect(body.audience_interests).toContain("water access");
  });

  it("builds the X publish body with bucket image paths", () => {
    const body = buildXPublishPayload(trackerLiveRow, 300);
    expect(body).toMatchObject({
      headline: "Water kiosks for Kondele",
      body_text: "Three new water kiosks in Kondele. See the work.",
      budget_kes: 240,
      duration_days: 14,
      image_paths: [`${OWNER}/${trackerLiveRow.id}/kiosk.jpg`],
    });
  });
});
