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
    expect(xPolicyError(undefined, { headline: "Vote MD", body: "Elect MD.", keywords: [] }, "River project")).toMatch(/political content/);
    expect(xPolicyError(undefined, { headline: "River plan", body: "See the plan.", keywords: [] }, "River project")).toBeNull();
  });
});
