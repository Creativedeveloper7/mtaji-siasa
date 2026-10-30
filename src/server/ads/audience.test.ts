import { describe, expect, it } from "vitest";
import { parseAdAudience } from "@/server/ads/audience";

describe("parseAdAudience", () => {
  it("defaults to every adult in all of Kenya", () => {
    expect(parseAdAudience({})).toEqual({ locations: ["Kenya"], ageGroup: "18-65+" });
    expect(parseAdAudience({ locations: ["Kenya"] })).toEqual({ locations: ["Kenya"], ageGroup: "18-65+" });
  });

  it("keeps counties, spelled as the list spells them", () => {
    expect(parseAdAudience({ locations: ["nairobi", "Kiambu", "Nairobi"], ageGroup: "18-34" })).toEqual({
      locations: ["Nairobi", "Kiambu"],
      ageGroup: "18-34",
    });
  });

  it("refuses places and age groups it does not know", () => {
    expect(parseAdAudience({ locations: ["Westlands"] })).toMatch(/not a Kenyan county/);
    expect(parseAdAudience({ ageGroup: "25-34" })).toMatch(/age group/);
    expect(parseAdAudience({ locations: ["Nairobi", "Kiambu", "Nakuru", "Kisumu", "Mombasa", "Nyeri"] })).toMatch(/at most 5/);
  });
});
