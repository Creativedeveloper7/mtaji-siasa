import { afterEach, describe, expect, it } from "vitest";
import { MIN_AD_BUDGET_KES } from "@/lib/constants";
import { trackerAdSettings } from "@/server/tracker/adly/config";

describe("trackerAdSettings minimum budget", () => {
  const original = process.env.AD_MIN_BUDGET_KES;
  afterEach(() => {
    if (original === undefined) delete process.env.AD_MIN_BUDGET_KES;
    else process.env.AD_MIN_BUDGET_KES = original;
  });

  it("defaults to KES 100", () => {
    delete process.env.AD_MIN_BUDGET_KES;
    expect(MIN_AD_BUDGET_KES).toBe(100);
    expect(trackerAdSettings().minBudgetKes).toBe(100);
  });

  it("follows AD_MIN_BUDGET_KES when the server sets it", () => {
    process.env.AD_MIN_BUDGET_KES = "750";
    expect(trackerAdSettings().minBudgetKes).toBe(750);
  });
});
