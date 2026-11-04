import { describe, expect, it } from "vitest";
import { MIN_AD_NETWORK_KES, adRunDays, minAdBudgetKes } from "@/lib/constants";

describe("ad budget minimum", () => {
  it("asks for at least one day of delivery on each network", () => {
    expect(minAdBudgetKes(1)).toBe(MIN_AD_NETWORK_KES);
    expect(minAdBudgetKes(2)).toBe(MIN_AD_NETWORK_KES * 2);
    expect(minAdBudgetKes(0)).toBe(MIN_AD_NETWORK_KES);
    expect(minAdBudgetKes(1, 500)).toBe(500);
  });

  it("says how many days a small budget lasts", () => {
    expect(adRunDays(1050, 1, 7)).toBe(7);
    expect(adRunDays(400, 1, 7)).toBe(2);
    expect(adRunDays(400, 2, 7)).toBe(1);
    expect(adRunDays(5000, 1, 7)).toBe(7);
  });
});
