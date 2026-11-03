import { describe, expect, it } from "vitest";
import { adXPostUrl, xPostUrl } from "@/lib/x-post";

describe("X post links", () => {
  it("links a post id and refuses anything else", () => {
    expect(xPostUrl("2116175275377742315")).toBe("https://x.com/i/web/status/2116175275377742315");
    expect(xPostUrl(" 2116175275377742315 ")).toBe("https://x.com/i/web/status/2116175275377742315");
    expect(xPostUrl("")).toBeUndefined();
    expect(xPostUrl(undefined)).toBeUndefined();
    expect(xPostUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("finds the X post of an ad", () => {
    expect(
      adXPostUrl([
        { platform: "google", budgetKes: 100, status: "live", externalIds: { google_campaign_id: "9" } },
        { platform: "x", budgetKes: 100, status: "live", externalIds: { x_campaign_id: "pjhxv", x_tweet_id: "180000000000" } },
      ])
    ).toBe("https://x.com/i/web/status/180000000000");
    expect(adXPostUrl([{ platform: "x", budgetKes: 100, status: "pending" }])).toBeUndefined();
  });
});
