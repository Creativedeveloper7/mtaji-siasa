import { beforeAll, describe, expect, it } from "vitest";
import type { AdPolicyReview } from "@/types";
import type { AuthSession } from "@/types/auth";

// Memory store, rules only (no AI key).
beforeAll(() => {
  process.env.MTAJI_STORE = "memory";
  delete process.env.OPENAI_API_KEY;
});

const leader = { userId: "usr-leader", role: "leader", leaderId: "ldr-001" } as AuthSession;

async function review(body: Record<string, unknown>) {
  const { reviewAdForX } = await import("@/server/ads/x-review");
  return reviewAdForX(leader, { projectId: "prj-001", keywords: ["Thika roads"], ...body });
}

describe("reviewAdForX", () => {
  it("rewrites what X would reject and explains why", async () => {
    const result = await review({
      headline: "Hon. Amara fixes roads",
      body: "Vote for progress in 2027! Guaranteed smooth roads for every home. See the Thika feeder road plan and progress.",
      keywords: ["UDA", "Thika roads"],
    });
    expect(result.ok).toBe(true);
    const r = (result as unknown as { body: { review: AdPolicyReview } }).body.review;
    expect(r.status).toBe("changed");
    expect(r.checkedBy).toBe("rules");
    expect(r.suggested.body).toBe("Smooth roads for every home. See the Thika feeder road plan and progress.");
    expect(r.suggested.keywords).toEqual(["Thika roads"]);
    expect(r.findings.filter((f) => f.severity === "fix").map((f) => f.rule)).toEqual(
      expect.arrayContaining(["political", "unproven_claim"])
    );
    // The project photo (public/home/project-road.jpg) is read and previewed as X will show it.
    expect(r.image.ok).toBe(true);
    expect(r.image.previewDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    // Without the AI review, Adly says what it can't check in the photo.
    expect(r.findings.some((f) => f.field === "image" && f.severity === "advice")).toBe(true);
  });

  it("passes clean copy through", async () => {
    const result = await review({ headline: "Thika roads are moving", body: "See progress on the Thika Town feeder road rehabilitation." });
    expect((result as unknown as { body: { review: AdPolicyReview } }).body.review.status).toBe("clear");
  });

  it("refuses projects the account does not own", async () => {
    const result = await review({ projectId: "prj-003", headline: "a", body: "b" });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe("xPolicyError", () => {
  it("blocks copy X would reject and lets Adly's version through", async () => {
    const { xPolicyError } = await import("@/server/ads/x-review");
    expect(await xPolicyError(undefined, { headline: "Vote MD", body: "Elect MD.", keywords: [] }, "River project")).toMatch(/political content/);
    expect(await xPolicyError(undefined, { headline: "River plan", body: "See the plan.", keywords: [] }, "River project")).toBeNull();
  });

  it("stops an X ad whose project page is political, whatever the ad says", async () => {
    const { xPolicyError } = await import("@/server/ads/x-review");
    const { getRepositories } = await import("@/server");
    const project = await getRepositories().content.findProject("prj-001");
    const political = { ...project!, description: "Mobilizing young Kenyans behind the Government's development agenda." };
    const copy = { headline: "River plan", body: "See the plan.", keywords: [] };
    expect(await xPolicyError(political, copy, political.name)).toMatch(/doesn't allow political ads aimed at Kenya/);
    expect(await xPolicyError(project, copy, project!.name)).toBeNull();
  });
});

describe("officeTitleBlock", () => {
  it("blocks a bare national-office title on the project page, not a qualified one", async () => {
    const { officeTitleBlock } = await import("@/server/ads/x-review");
    const leader = (position: string) => ({ honorific: "Hon.", name: "Mbehi David", position }) as never;
    expect(officeTitleBlock(leader("President"), "Mashinani Youth")).toMatchObject({ rule: "impersonation", severity: "block" });
    expect(officeTitleBlock(leader("President, Mashinani Youth"), "Mashinani Youth")).toBeNull();
    expect(officeTitleBlock(leader("Member of Parliament — Kisumu Central"), "x")).toBeNull();
    expect(officeTitleBlock(leader("Senator"), "x")).toBeNull();
    expect(officeTitleBlock(undefined, "x")).toBeNull();
  });
});

describe("reviewAdForX for an opportunity", () => {
  it("reviews one of the leader's own opportunities and its photo", async () => {
    const { reviewAdForX } = await import("@/server/ads/x-review");
    const result = await reviewAdForX(leader, {
      opportunityId: "opp-001",
      headline: "Local supplier openings",
      body: "Supply materials to the Thika roads works. See the requirements and apply on the page.",
      keywords: ["Thika suppliers"],
    });
    expect(result.ok).toBe(true);
    const r = (result as unknown as { body: { review: AdPolicyReview } }).body.review;
    expect(r.image.ok).toBe(true);
    expect(r.findings.filter((f) => f.severity === "block")).toEqual([]);
  });

  it("refuses an opportunity the account doesn't own", async () => {
    const { reviewAdForX } = await import("@/server/ads/x-review");
    const result = await reviewAdForX(leader, { opportunityId: "opp-003", headline: "a", body: "b", keywords: ["c"] });
    expect(result).toMatchObject({ ok: false, status: 400, error: "Choose one of your own opportunities to promote." });
  });
});
