import { describe, expect, it } from "vitest";
import { leaderIdsFrom } from "./links";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

describe("leaderIdsFrom", () => {
  it("puts the owner's figure first, then commissioned figures, and allows none", () => {
    const owners = new Map<string, string | null>([
      ["cm-politician", "user-a"],
      ["cm-org", "user-org"],
    ]);
    const figures = [
      { id: "fig-b", user_id: "user-b", commissioned_projects: [P1] },
      { id: "fig-a", user_id: "user-a", commissioned_projects: [] },
      { id: "fig-seeded", user_id: null, commissioned_projects: [P1, "33333333-3333-4333-8333-333333333333"] },
    ];
    const result = leaderIdsFrom(
      [
        { id: P1, changemaker_id: "cm-politician" },
        { id: P2, changemaker_id: "cm-org" },
      ],
      owners,
      figures
    );
    expect(result.get(P1)).toEqual(["fig-a", "fig-b", "fig-seeded"]);
    expect(result.get(P2)).toEqual([]);
    expect(result.has("33333333-3333-4333-8333-333333333333")).toBe(false);
  });
});
