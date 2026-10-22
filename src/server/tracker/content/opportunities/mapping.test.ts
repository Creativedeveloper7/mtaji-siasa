import { describe, expect, it } from "vitest";
import type { Opportunity, OpportunityApplication } from "@/types";
import {
  adlyInterestFromRow,
  adlyInterestToRow,
  applicationFromRow,
  applicationInsertRow,
  applicationReviewPatch,
  applicationStatusFromTracker,
  applicationStatusToTracker,
  categoryFromTracker,
  categoryToTracker,
  countyFromTracker,
  isAdlyInterestRow,
  LIVE_APPLICATION_STATUSES,
  LISTING_STATUSES,
  listingStatusToTracker,
  nairobiToday,
  opportunityFromRow,
  opportunityStatusFromTracker,
  opportunityToRow,
  OpportunityValidationError,
  stepsFromTracker,
  stepsToTracker,
  type OpportunityRow,
} from "./mapping";

// 2026-10-22 10:00 in Nairobi
const NOW = new Date("2026-10-22T07:00:00Z");

/** Shapes of the 3 live rows (2026-10-22), personal data removed. */
const liveGrant: OpportunityRow = {
  id: "994b773b-3676-4461-8dde-d789bc698dac",
  author_id: null,
  initiative_id: null,
  kind: "grant",
  title: "Youth Stipend",
  organization: null,
  category: null,
  description: null,
  eligibility: null,
  how_to_apply: null,
  apply_url: null,
  amount: "Stipend",
  deadline: null,
  location: null,
  slots: null,
  listing_status: "published",
  created_at: "2026-08-20 13:08:25.682352+00",
  updated_at: "2026-08-20 13:08:25.682352+00",
};

const liveCall: OpportunityRow = {
  ...liveGrant,
  id: "bf2f216e-e810-4518-aeff-8d7276868390",
  author_id: "aaaaaaaa-0000-4000-8000-000000000001",
  kind: "call",
  title: "Public Participation Forum",
  category: "Public participation",
  amount: null,
  deadline: "2026-10-01",
  location: "kibra,nairobi",
  slots: "100",
  how_to_apply: "Faida application",
  apply_url: "https://example.org/apply",
  created_at: "2026-09-08 14:37:45.213428+00",
};

const liveContent: OpportunityRow = {
  ...liveCall,
  id: "7aec8598-4dfa-4f2e-87dc-202335739256",
  initiative_id: "bbbbbbbb-0000-4000-8000-000000000001",
  category: "Content creation",
  deadline: "2026-09-30",
  location: "Kakamega",
  slots: "10",
};

describe("category mapping", () => {
  it("reads every grant as funding, whatever its category", () => {
    expect(categoryFromTracker("grant", null)).toBe("funding");
    expect(categoryFromTracker("grant", "Education")).toBe("funding");
  });

  it.each([
    ["Job", "jobs"],
    ["Internship", "jobs"],
    ["Tender", "tenders"],
    ["Training", "training"],
    ["Fellowship", "training"],
    ["Youth", "youth"],
    ["Project ambassadorship", "youth"],
    ["Content creation", "youth"],
    ["Volunteering", "youth"],
    ["Business", "business"],
    ["Public participation", "other"],
    [null, "other"],
    ["Something custom", "other"],
    ["  content CREATION ", "youth"],
  ] as const)("reads call %s as %s", (category, expected) => {
    expect(categoryFromTracker("call", category)).toBe(expected);
  });

  it("writes Siasa categories to kind + category", () => {
    expect(categoryToTracker("jobs")).toEqual({ kind: "call", category: "Job" });
    expect(categoryToTracker("tenders")).toEqual({ kind: "call", category: "Tender" });
    expect(categoryToTracker("training")).toEqual({ kind: "call", category: "Training" });
    expect(categoryToTracker("youth")).toEqual({ kind: "call", category: "Youth" });
    expect(categoryToTracker("business")).toEqual({ kind: "call", category: "Business" });
    expect(categoryToTracker("other")).toEqual({ kind: "call", category: null });
    expect(categoryToTracker("funding")).toEqual({ kind: "grant", category: null });
  });

  it("keeps the existing Tracker category when it reads back the same", () => {
    expect(categoryToTracker("funding", { kind: "grant", category: "Education" })).toEqual({
      kind: "grant",
      category: "Education",
    });
    expect(categoryToTracker("jobs", { kind: "call", category: "Internship" })).toEqual({
      kind: "call",
      category: "Internship",
    });
    expect(categoryToTracker("other", { kind: "call", category: "Public participation" })).toEqual({
      kind: "call",
      category: "Public participation",
    });
    // A changed category replaces it.
    expect(categoryToTracker("tenders", { kind: "call", category: "Internship" })).toEqual({
      kind: "call",
      category: "Tender",
    });
    // A grant moved to a call drops the grant category.
    expect(categoryToTracker("youth", { kind: "grant", category: "Youth" })).toEqual({ kind: "call", category: "Youth" });
  });

  it("never writes a kind outside the CHECK list", () => {
    for (const category of ["jobs", "tenders", "training", "funding", "youth", "business", "other"] as const) {
      expect(["grant", "call"]).toContain(categoryToTracker(category).kind);
    }
  });
});

describe("listing status and deadline", () => {
  it("uses Nairobi's date", () => {
    expect(nairobiToday(new Date("2026-10-22T21:30:00Z"))).toBe("2026-10-23");
    expect(nairobiToday(new Date("2026-10-22T20:59:00Z"))).toBe("2026-10-22");
  });

  it.each([
    ["closed", "2027-01-01", "closed"],
    ["published", "2026-10-21", "closed"],
    ["published", "2026-10-22", "closing-soon"],
    ["published", "2026-10-29", "closing-soon"],
    ["published", "2026-10-30", "open"],
    ["published", null, "open"],
    ["published", "", "open"],
    ["published", "not a date", "open"],
    ["closed", null, "closed"],
  ] as const)("listing %s with deadline %s reads as %s", (listing, deadline, expected) => {
    expect(opportunityStatusFromTracker(listing, deadline, NOW)).toBe(expected);
  });

  const stored = (listing_status: string, deadline: string | null) => ({ listing_status, deadline });

  it("writes closed only when closing is meant", () => {
    expect(listingStatusToTracker("open", "2026-12-01", stored("published", "2026-12-01"), NOW)).toBe("published");
    expect(listingStatusToTracker("closing-soon", "2026-10-25", stored("closed", "2026-10-25"), NOW)).toBe("published");
    expect(listingStatusToTracker(undefined, null, undefined, NOW)).toBe("published");
    // An explicit close of a live listing.
    expect(listingStatusToTracker("closed", "2026-12-01", stored("published", "2026-12-01"), NOW)).toBe("closed");
    expect(listingStatusToTracker("closed", null, stored("published", null), NOW)).toBe("closed");
    // Stored closed stays closed.
    expect(listingStatusToTracker("closed", "2026-10-01", stored("closed", "2026-10-01"), NOW)).toBe("closed");
    expect(listingStatusToTracker("closed", "2026-12-01", stored("closed", "2026-10-01"), NOW)).toBe("closed");
    // New rows: closed with a past deadline is the expired echo.
    expect(listingStatusToTracker("closed", "2026-10-01", undefined, NOW)).toBe("published");
    expect(listingStatusToTracker("closed", "2026-12-01", undefined, NOW)).toBe("closed");
  });

  it("keeps an expired-but-published listing published when its deadline is extended", () => {
    // Stored: published, deadline passed -> every read says "closed" (derived).
    const row = stored("published", "2026-10-01");
    expect(opportunityStatusFromTracker(row.listing_status, row.deadline, NOW)).toBe("closed");
    // The editor echoes "closed" back with a new future deadline: must reopen, not close.
    expect(listingStatusToTracker("closed", "2026-12-01", row, NOW)).toBe("published");
    // Same echo without moving the deadline: still published (reads closed by date).
    expect(listingStatusToTracker("closed", "2026-10-01", row, NOW)).toBe("published");
  });

  it("never writes a listing_status outside the CHECK list", () => {
    for (const status of ["open", "closing-soon", "closed", undefined] as const) {
      for (const deadline of [null, "2026-01-01", "2027-01-01"]) {
        for (const existing of [undefined, stored("closed", deadline), stored("published", deadline)]) {
          expect(LISTING_STATUSES).toContain(listingStatusToTracker(status, deadline, existing, NOW));
        }
      }
    }
  });
});

describe("how_to_apply", () => {
  it("splits lines and strips list markers", () => {
    expect(stepsFromTracker("1. Register\n2) Upload CV\n- Wait\n* Call\n\n  • Done  ")).toEqual([
      "Register",
      "Upload CV",
      "Wait",
      "Call",
      "Done",
    ]);
    expect(stepsFromTracker("Faida application")).toEqual(["Faida application"]);
    expect(stepsFromTracker(null)).toEqual([]);
  });

  it("joins steps with newlines", () => {
    expect(stepsToTracker(["Register", " ", "Upload CV "])).toBe("Register\nUpload CV");
    expect(stepsToTracker([])).toBeNull();
    expect(stepsToTracker(undefined)).toBeNull();
  });
});

describe("county fallback", () => {
  it("prefers the county column", () => {
    expect(countyFromTracker({ county: "Kisumu", location: "Kibra, Nairobi" })).toBe("Kisumu");
  });

  it("falls back to the linked initiative's county", () => {
    expect(
      countyFromTracker(
        { location: "Kakamega town" },
        { id: "x", location: { county: "Kakamega", constituency: "Lurambi" }, reference_images: [] }
      )
    ).toBe("Kakamega");
  });

  it("treats an empty initiative county as missing", () => {
    expect(countyFromTracker({ location: "Mumias" }, { id: "x", location: { county: "" }, reference_images: [] })).toBe(
      "Mumias"
    );
  });

  it("uses the last comma part of location without ' County'", () => {
    expect(countyFromTracker({ location: "kibra,nairobi" })).toBe("Nairobi");
    expect(countyFromTracker({ location: "Lurambi, Kakamega County" })).toBe("Kakamega");
    expect(countyFromTracker({ location: "Taita-taveta" })).toBe("Taita-Taveta");
    expect(countyFromTracker({ location: null })).toBe("");
    expect(countyFromTracker({ location: " , " })).toBe("");
  });
});

describe("opportunityFromRow (live rows)", () => {
  it("maps the grant with no author, category or deadline", () => {
    const item = opportunityFromRow(liveGrant, { slug: "youth-stipend", now: NOW });
    expect(item).toMatchObject({
      id: liveGrant.id,
      slug: "youth-stipend",
      title: "Youth Stipend",
      category: "funding",
      location: "",
      county: "",
      deadline: "",
      eligibility: "",
      description: "",
      status: "open",
      openingDate: "2026-08-20",
      benefits: ["Stipend"],
      requirements: [],
    });
    expect(item.leaderId).toBeUndefined();
    expect(item.projectId).toBeUndefined();
    expect(item.image).toBeUndefined();
    expect(item.applicationSteps).toBeUndefined();
    expect(item.applicationUrl).toBeUndefined();
  });

  it("maps the public participation call: passed deadline reads closed", () => {
    const item = opportunityFromRow(liveCall, { slug: "public-participation-forum", leaderId: "pf-1", now: NOW });
    expect(item).toMatchObject({
      category: "other",
      location: "kibra,nairobi",
      county: "Nairobi",
      deadline: "2026-10-01",
      status: "closed",
      leaderId: "pf-1",
      applicationSteps: ["Faida application"],
      applicationUrl: "https://example.org/apply",
      benefits: [],
    });
  });

  it("maps the content creation call with initiative fallbacks", () => {
    const item = opportunityFromRow(liveContent, {
      slug: "x",
      initiative: {
        id: liveContent.initiative_id!,
        location: { county: "Kakamega" },
        reference_images: ["https://img.example/1.jpg"],
      },
      relatedMediaIds: ["blog-1"],
      now: NOW,
    });
    expect(item).toMatchObject({
      category: "youth",
      county: "Kakamega",
      image: "https://img.example/1.jpg",
      projectId: liveContent.initiative_id,
      relatedMediaIds: ["blog-1"],
    });
  });

  it("reads the NEW M5b columns when present", () => {
    const item = opportunityFromRow(
      {
        ...liveGrant,
        county: "Mombasa",
        image_url: "https://img.example/own.jpg",
        benefits: ["KES 20,000", " "],
        requirements: ["ID card"],
        title: "  ",
      },
      { slug: "s", initiative: { id: "i", location: { county: "X" }, reference_images: ["https://other"] } }
    );
    expect(item).toMatchObject({
      title: "Untitled",
      county: "Mombasa",
      image: "https://img.example/own.jpg",
      benefits: ["KES 20,000"],
      requirements: ["ID card"],
    });
  });
});

describe("opportunityToRow", () => {
  const base: Opportunity = {
    id: "opp-123",
    slug: "x",
    title: " Junior Engineer ",
    category: "jobs",
    location: "Thika, Kiambu",
    county: "Kiambu",
    deadline: "2026-12-01T00:00:00.000Z",
    eligibility: "Graduates",
    description: "Build roads",
    applicationSteps: ["Register", "Upload CV"],
    applicationUrl: "https://jobs.example/apply",
    benefits: ["Salary"],
    requirements: ["Degree"],
    image: "https://img.example/a.jpg",
    projectId: "bbbbbbbb-0000-4000-8000-000000000001",
    status: "open",
  };

  it("splits live columns from the NEW ones and never sets author, slots or amount", () => {
    const write = opportunityToRow(base, null, NOW);
    expect(write.base).toEqual({
      title: "Junior Engineer",
      kind: "call",
      category: "Job",
      organization: null,
      description: "Build roads",
      eligibility: "Graduates",
      how_to_apply: "Register\nUpload CV",
      apply_url: "https://jobs.example/apply",
      deadline: "2026-12-01",
      location: "Thika, Kiambu",
      initiative_id: "bbbbbbbb-0000-4000-8000-000000000001",
      listing_status: "published",
    });
    expect(write.extra).toEqual({
      county: "Kiambu",
      image_url: "https://img.example/a.jpg",
      benefits: ["Salary"],
      requirements: ["Degree"],
    });
    expect(write.base).not.toHaveProperty("author_id");
    expect(write.base).not.toHaveProperty("slots");
    expect(write.base).not.toHaveProperty("amount");
  });

  it("writes an empty deadline as null (rolling)", () => {
    expect(opportunityToRow({ ...base, deadline: "" }, null, NOW).base.deadline).toBeNull();
  });

  it("rejects a non-http application link and an empty title", () => {
    expect(() => opportunityToRow({ ...base, applicationUrl: "javascript:alert(1)" })).toThrow(OpportunityValidationError);
    expect(() => opportunityToRow({ ...base, title: "  " })).toThrow(OpportunityValidationError);
  });

  it("does not copy the amount shown as a benefit into benefits", () => {
    const read = opportunityFromRow(liveGrant, { slug: "s", now: NOW });
    const write = opportunityToRow(read, liveGrant, NOW);
    expect(write.extra.benefits).toEqual([]);
    expect(write.base.kind).toBe("grant");
    expect(write.base.category).toBeNull();
  });

  it("round-trips the expired live call without closing it", () => {
    const read = opportunityFromRow(liveCall, { slug: "s", now: NOW });
    const write = opportunityToRow(read, liveCall, NOW);
    expect(write.base.listing_status).toBe("published");
    expect(write.base.category).toBe("Public participation");
  });
});

describe("application mapping", () => {
  it.each([
    ["pending", "submitted"],
    ["reviewed", "reviewing"],
    ["shortlisted", "shortlisted"],
    ["accepted", "accepted"],
    ["rejected", "rejected"],
    ["weird", "submitted"],
    [null, "submitted"],
  ] as const)("reads %s as %s", (status, expected) => {
    expect(applicationStatusFromTracker(status)).toBe(expected);
  });

  it("writes statuses and never downgrades shortlisted", () => {
    expect(applicationStatusToTracker("submitted")).toBe("pending");
    expect(applicationStatusToTracker("reviewing")).toBe("reviewed");
    expect(applicationStatusToTracker("shortlisted")).toBe("shortlisted");
    expect(applicationStatusToTracker("accepted")).toBe("accepted");
    for (const status of ["submitted", "reviewing", "accepted", "rejected"] as const) {
      expect(LIVE_APPLICATION_STATUSES).toContain(applicationStatusToTracker(status));
    }
    expect(LIVE_APPLICATION_STATUSES).not.toContain(applicationStatusToTracker("shortlisted"));
  });

  it("maps a live-shaped row with no M6 columns", () => {
    expect(
      applicationFromRow({
        id: "a1",
        opportunity_id: "o1",
        applicant_id: null,
        full_name: "Jane",
        email: "jane@example.com",
        phone: null,
        message: null,
        status: "pending",
        created_at: "2026-10-20T08:00:00Z",
      })
    ).toEqual({
      id: "a1",
      opportunityId: "o1",
      applicantId: "",
      fullName: "Jane",
      email: "jane@example.com",
      phone: "",
      county: undefined,
      message: "",
      attachmentUrl: undefined,
      status: "submitted",
      reviewNote: undefined,
      createdAt: "2026-10-20T08:00:00Z",
      updatedAt: "2026-10-20T08:00:00Z",
    });
  });

  const app: OpportunityApplication = {
    id: "app-1",
    opportunityId: "o1",
    applicantId: "u1",
    fullName: " Jane ",
    email: "Jane@Example.com",
    phone: "+254700000000",
    county: "Nairobi",
    message: "Hello there, I would like to apply",
    attachmentUrl: "https://cv.example/jane",
    status: "accepted",
    reviewNote: "Great",
    createdAt: "",
    updatedAt: "",
  };

  it("inserts as pending with the session user as applicant", () => {
    const row = applicationInsertRow(app, "session-user");
    expect(row.base).toEqual({
      opportunity_id: "o1",
      applicant_id: "session-user",
      full_name: "Jane",
      email: "jane@example.com",
      phone: "+254700000000",
      message: "Hello there, I would like to apply",
      status: "pending",
    });
    expect(row.extra).toEqual({ county: "Nairobi", attachment_url: "https://cv.example/jane" });
  });

  it("review patch carries status and note only", () => {
    expect(applicationReviewPatch({ ...app, status: "shortlisted" })).toEqual({
      base: { status: "shortlisted" },
      extra: { review_note: "Great" },
    });
  });
});

describe("Adly interest leads", () => {
  const lead = {
    id: "11111111-1111-4111-8111-111111111111",
    fullName: "Amina",
    email: "AMINA@example.com",
    phone: "+254711000001",
    organization: "Team Amina",
    role: "Campaign Team",
    interests: ["Advertising", "Campaign Posters"],
    createdAt: "2026-10-22T08:00:00Z",
  };

  it("round-trips through contact_submissions", () => {
    const row = adlyInterestToRow(lead);
    expect(row).toMatchObject({
      name: "Amina",
      email: "amina@example.com",
      subject: "Adly interest: Campaign Team · Team Amina",
      message: "Phone: +254711000001\nInterests: Advertising, Campaign Posters",
    });
    expect(isAdlyInterestRow(row)).toBe(true);
    expect(adlyInterestFromRow(row)).toEqual({ ...lead, email: "amina@example.com" });
  });

  it("handles no organization and no interests", () => {
    const row = adlyInterestToRow({ ...lead, organization: " ", interests: [] });
    expect(row.subject).toBe("Adly interest: Campaign Team");
    expect(adlyInterestFromRow(row)).toMatchObject({ organization: "", interests: [], role: "Campaign Team" });
  });

  it("ignores other contact form rows", () => {
    expect(isAdlyInterestRow({ subject: "Hello" })).toBe(false);
    expect(isAdlyInterestRow({ subject: null })).toBe(false);
  });
});
