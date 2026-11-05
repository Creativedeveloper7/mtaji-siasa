import { describe, expect, it } from "vitest";
import {
  imageNameMismatch,
  imageTextProblems,
  nameVariants,
  opportunityBlocksAnyNetwork,
  opportunityProblemsForX,
  reviewCopyForX,
  suggestLandingForX,
  xCopyProblems,
  xLandingProblems,
} from "@/server/ads/x-policy";

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
    expect(review.suggested.headline).toBe("Nairobi River Cleaning");
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

  it("drops the leader's name even without a title", () => {
    const review = reviewCopyForX(
      {
        headline: "River plan",
        body: "David Mbehi brings young people together to clean the river. Join the next community day by the river.",
        keywords: ["Mbehi David", "Nairobi River"],
      },
      { ...context, officialNames: ["Mbehi David"] }
    );
    expect(review.suggested.body).toBe("Join the next community day by the river.");
    expect(review.suggested.keywords).toEqual(["Nairobi River"]);
    expect(new Set(review.findings.map((f) => f.rule))).toEqual(new Set(["political"]));
  });

  it("catches government-agenda advocacy, offices and legislation", () => {
    for (const body of [
      "We mobilise young Kenyans behind the Government's development agenda.",
      "Part of the Kazi Delivery Movement.",
      "Endorsed by the Cabinet Secretary for Youth.",
      "Supporting the Finance Bill before Parliament.",
      "Stand with our MP for clean water.",
    ]) {
      expect(xCopyProblems({ headline: "River plan", body, keywords: [] }, context).map((f) => f.rule)).toContain("political");
    }
  });
});

describe("nameVariants", () => {
  it("drops titles and also tries the names the other way round", () => {
    expect(nameVariants(["Hon. Mbehi David", "Al"])).toEqual(["Mbehi David", "David Mbehi"]);
  });
});

describe("xLandingProblems", () => {
  it("blocks the Mashinani Youth project pages X rejected", () => {
    const pages = [
      {
        name: "Mashinani Youth Usawa Movement",
        description:
          "The Mashinani Youth Movement-Kazi Delivery Movement (MY-KDM) is a national grassroots youth initiative committed to mobilizing young people to advance Kenya’s development agenda through civic engagement, strategic communication and media production. Structured from the Ward Level to the National Secretariat, MYM provides a coordinated platform for youth empowerment.",
      },
      {
        name: "Mashinani Youth - Kazi Delivery Movement",
        description:
          "Mashinani Youth Kazi Delivery Movement (MY-KDM) is a national youth movement focused on mobilizing young Kenyans to become active champions of the Government’s development agenda, regardless of political affiliation.",
      },
    ];
    for (const page of pages) {
      const problems = xLandingProblems(page, { officialNames: ["Mbehi David"] });
      expect(problems.length).toBeGreaterThan(0);
      expect(problems.every((f) => f.field === "landing" && f.severity === "block" && f.rule === "political")).toBe(true);
    }
  });

  it("lets an ordinary project page through", () => {
    const page = {
      name: "Nairobi River Cleaning & Regeneration Project",
      description:
        "Clearing waste from the Nairobi River, replanting the riverbanks and building green public spaces with local youth groups. Members of the community campaigned for clean water for years.",
    };
    expect(xLandingProblems(page, { officialNames: ["Mbehi David"] })).toEqual([]);
  });

  it("blocks a project page that names the leader", () => {
    const page = { name: "Mbehi David Youth Fund", description: "Training for young people." };
    expect(xLandingProblems(page, { officialNames: ["Hon. Mbehi David"] })[0]?.found).toBe("Mbehi David");
  });
});

describe("suggestLandingForX", () => {
  const context = { officialNames: ["Mbehi David"], county: "Nairobi" };

  it("keeps the work and drops the politics from the Mashinani page", () => {
    const page = {
      name: "Mashinani Youth Usawa Movement",
      description:
        "The Mashinani Youth Movement-Kazi Delivery Movement (MY-KDM) is a national grassroots youth initiative committed to mobilizing young people to advance Kenya’s development agenda through civic engagement, strategic communication and media production. Structured from the Ward Level to the National Secretariat, MYM provides a coordinated platform for youth empowerment through jobs, project ambassadorship, creative arts, volunteerism, and community service towards nation building.",
    };
    const suggested = suggestLandingForX(page, context);
    expect(suggested.name).toBe(page.name);
    expect(suggested.description).toBe(
      "MYM provides a coordinated platform for youth empowerment through jobs, project ambassadorship, creative arts, volunteerism, and community service towards nation building."
    );
    expect(xLandingProblems(suggested, context)).toEqual([]);
  });

  it("writes a plain line when nothing usable is left, and replaces a political name", () => {
    const suggested = suggestLandingForX(
      { name: "Mbehi David Youth Fund", description: "Supporting the Government's development agenda." },
      context
    );
    expect(suggested.name).toBe("Community project in Nairobi County");
    expect(xLandingProblems(suggested, context)).toEqual([]);
  });
});

describe("photo text", () => {
  const poster = [
    "MASHINANI YOUTH",
    "KAZI DELIVERY MOVEMENT",
    "EMPOWERED ENGAGED DELIVERED TRANSFORMED",
    "KUTOKA GROUND, HADI SINGAPORE!",
    "Turkana West Pokot Marsabit Mandera Nairobi",
  ].join("\n");

  it("finds the political slogan on the Mashinani poster", () => {
    expect(imageTextProblems(poster, { officialNames: ["Mbehi David"] })).toEqual(["KAZI DELIVERY"]);
    expect(imageTextProblems("Clean water for Kibera. Community day on Saturday.", {})).toEqual([]);
  });

  it("notices a different version of the project name on the photo", () => {
    expect(imageNameMismatch(poster, "Mashinani Youth Usawa Movement")).toEqual(["usawa"]);
    expect(imageNameMismatch("MASHINANI YOUTH USAWA MOVEMENT", "Mashinani Youth Usawa Movement")).toBeNull();
    // Part of a long name on the photo is not a different name.
    expect(imageNameMismatch("Nairobi River clean-up day", "Nairobi River Cleaning & Regeneration Project")).toBeNull();
    expect(imageNameMismatch("A photo with no name", "Mashinani Youth Usawa Movement")).toBeNull();
  });
});

describe("jobs without openings", () => {
  const copy = {
    headline: "Mashinani Youth Usawa Movement",
    body: "MYM provides a coordinated platform for youth empowerment through jobs, project ambassadorship, creative arts, volunteerism, and community service towards nation building.",
    keywords: ["youth jobs", "creative arts"],
  };

  it("drops the jobs claim when the project lists no opportunities", () => {
    const review = reviewCopyForX(copy, { ...context, projectName: "Mashinani Youth Usawa Movement", hasOpportunities: false });
    expect(review.findings.map((f) => f.rule)).toContain("financial_promise");
    expect(review.suggested.body).not.toMatch(/jobs/);
    expect(review.suggested.keywords).toEqual(["creative arts"]);
  });

  it("keeps it when the project lists opportunities, or when that isn't known", () => {
    expect(xCopyProblems(copy, { ...context, hasOpportunities: true })).toEqual([]);
    expect(xCopyProblems(copy, context)).toEqual([]);
  });
});

describe("opportunityProblemsForX", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const job = {
    title: "Site supervisor, Thika feeder roads",
    category: "jobs",
    deadline: "2026-12-01",
    description: "Supervise grading and drainage works. Apply on this page with your CV.",
    eligibility: "Diploma in civil engineering and two years on road works.",
  };

  it("passes an open, complete job listing", () => {
    expect(opportunityProblemsForX(job, now)).toEqual([]);
  });

  it("blocks closed listings, funding and fees to apply", () => {
    const rules = (listing: Parameters<typeof opportunityProblemsForX>[0]) =>
      opportunityProblemsForX(listing, now).map((f) => [f.severity, f.found]);
    expect(rules({ ...job, deadline: "2026-10-01" })).toEqual([["block", "Deadline 2026-10-01"]]);
    expect(rules({ ...job, status: "closed" })).toEqual([["block", "Marked closed"]]);
    expect(rules({ ...job, category: "funding" })).toEqual([["block", "Funding opportunity"]]);
    expect(rules({ ...job, applicationSteps: ["Pay a registration fee of KES 500 to M-Pesa."] })).toEqual([
      ["block", "registration fee"],
    ]);
  });

  it("only advises on tenders and on who may apply", () => {
    expect(opportunityProblemsForX({ ...job, category: "tenders" }, now).map((f) => f.severity)).toEqual(["advice"]);
    expect(opportunityProblemsForX({ ...job, eligibility: "Women only, aged 18-35." }, now)).toEqual([
      expect.objectContaining({ severity: "advice", found: "Women only" }),
    ]);
  });

  it("stops closed and fee-charging listings on every network, funding only on X", () => {
    expect(opportunityBlocksAnyNetwork({ ...job, category: "funding" }, now)).toEqual([]);
    expect(opportunityBlocksAnyNetwork({ ...job, deadline: "2026-10-01" }, now)).toHaveLength(1);
  });
});
