import { describe, expect, it } from "vitest";
import { reviewCopyForX, xCopyProblems } from "@/server/ads/x-policy";

const context = {
  projectName: "Nairobi River Cleaning & Regeneration Project",
  county: "Nairobi",
  status: "planned" as const,
  limits: { headline: 30, body: 220 },
};

describe("reviewCopyForX", () => {
  it("leaves policy-safe copy alone", () => {
    const copy = {
      headline: "River regeneration plan",
      body: "A plan to restore the Nairobi River: clearing waste, replanting the riverbanks and building green public spaces with local youth groups. See the plan and its milestones.",
      keywords: ["Nairobi River", "clean-up"],
    };
    const review = reviewCopyForX(copy, context);
    expect(review.findings).toEqual([]);
    expect(review.suggested).toEqual(copy);
  });

  it("drops the money promise X rejected on the Faida ads", () => {
    const review = reviewCopyForX(
      {
        headline: "Faida on WhatsApp",
        body: "Faida is a WhatsApp assistant that helps Kenyans find bursaries, grants, loans and benefits you qualify for. Open bursary deadlines, shared weekly.",
        keywords: ["bursaries"],
      },
      { ...context, projectName: "Faida" }
    );
    expect(review.findings.map((f) => f.rule)).toContain("financial_promise");
    expect(review.suggested.body).toBe("Open bursary deadlines, shared weekly.");
  });

  it("keeps political content out of the headline, text and keywords", () => {
    const review = reviewCopyForX(
      {
        headline: "Hon. MD cleans the river",
        body: "Vote for Hon MD in 2027. The plan restores the riverbanks and builds green public spaces for families.",
        keywords: ["UDA", "Nairobi River"],
      },
      context
    );
    const rules = new Set(review.findings.map((f) => f.rule));
    expect(rules).toEqual(new Set(["political"]));
    expect(review.suggested.headline).toBe("Nairobi River Cleaning &");
    expect(review.suggested.body).toBe("The plan restores the riverbanks and builds green public spaces for families.");
    expect(review.suggested.keywords).toEqual(["Nairobi River"]);
  });

  it("does not let a planned project claim it is finished", () => {
    const copy = { headline: "River project", body: "We have completed the river clean-up. Join the next community day by the river.", keywords: [] };
    expect(reviewCopyForX(copy, context).suggested.body).toBe("Join the next community day by the river.");
    expect(xCopyProblems(copy, { ...context, status: "completed" })).toEqual([]);
  });

  it("removes guarantees, clickbait, shouting and extra hashtags", () => {
    const review = reviewCopyForX(
      {
        headline: "CLEAN RIVER NOW!!",
        body: "Click here! Guaranteed clean water for every home by the river. #Nairobi #River #Clean #Green",
        keywords: ["river"],
      },
      context
    );
    expect(review.suggested.headline).toBe("Clean river now!");
    expect(review.suggested.body).toBe("Clean water for every home by the river. #Nairobi #River");
    expect(new Set(review.findings.map((f) => f.rule))).toEqual(new Set(["formatting", "clickbait", "unproven_claim"]));
  });

  it("writes a plain project line when nothing usable is left", () => {
    const review = reviewCopyForX({ headline: "Vote MD", body: "Vote MD! Elect MD in 2027.", keywords: ["vote MD"] }, context);
    expect(review.suggested.body).toBe("Nairobi River Cleaning & Regeneration Project in Nairobi County: see the plan and its milestones.");
    expect(review.suggested.keywords).toEqual(["Nairobi County", "community projects"]);
    expect(xCopyProblems(review.suggested, context)).toEqual([]);
  });

  it("does not trip on ordinary words that contain a rule word", () => {
    const copy = { headline: "Devoted to clean water", body: "Members of the community campaigned for clean water; MPESA payments are not needed. Helping hands welcome.", keywords: ["campaign"] };
    expect(xCopyProblems(copy, context)).toEqual([]);
  });
});
