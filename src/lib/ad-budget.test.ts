import { describe, expect, it } from "vitest";
import { MIN_AD_NETWORK_KES, adBudgetForDays, adMediaKes, adRunDays, minAdBudgetKes } from "@/lib/constants";

describe("ad budget minimum", () => {
  it("asks for at least one day of delivery on each network", () => {
    expect(minAdBudgetKes(1)).toBe(MIN_AD_NETWORK_KES);
    expect(minAdBudgetKes(2)).toBe(MIN_AD_NETWORK_KES * 2);
    expect(minAdBudgetKes(0)).toBe(MIN_AD_NETWORK_KES);
    expect(minAdBudgetKes(1, 500)).toBe(500);
  });

  it("leaves at least $1 for the network after the 20% fee", () => {
    expect(adMediaKes(MIN_AD_NETWORK_KES) / 134).toBeGreaterThanOrEqual(1);
  });

  it("keeps 20% as the platform fee", () => {
    expect(adMediaKes(400)).toBe(320);
    expect(adMediaKes(400, 0)).toBe(400);
    expect(adMediaKes(0)).toBe(0);
  });

  it("says how many days a budget lasts at $1 a day per network", () => {
    // Kayole: KES 400 -> KES 320 -> $2.39 on X
    expect(adRunDays(400, 1, 7)).toBe(2);
    expect(adRunDays(400, 2, 7)).toBe(1);
    expect(adRunDays(5000, 1, 7)).toBe(7);
    expect(adRunDays(400, 1, 7, 0)).toBe(2);
  });

  it("suggests a budget that runs every day", () => {
    expect(adBudgetForDays(7, 1)).toBe(1200);
    expect(adRunDays(adBudgetForDays(7, 1), 1, 7)).toBe(7);
    expect(adRunDays(adBudgetForDays(3, 2), 2, 3)).toBe(3);
    expect(adBudgetForDays(1, 1)).toBe(MIN_AD_NETWORK_KES);
  });
});
