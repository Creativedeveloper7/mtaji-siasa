import { describe, expect, it } from "vitest";
import type { Leader, Opportunity } from "@/types";
import { parseLeader, parseOpportunity } from "@/server/content/parse";

const opportunity: Opportunity = {
  id: "opp-1",
  slug: "opp",
  title: "Old title",
  category: "jobs",
  location: "Thika",
  county: "Kiambu",
  deadline: "",
  eligibility: "",
  description: "",
  applicationUrl: "munene.dev",
};

describe("parseOpportunity application link", () => {
  it("keeps a stored non-http link when the edit does not touch it", () => {
    const parsed = parseOpportunity({ title: "New title" }, opportunity);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.title).toBe("New title");
    expect(parsed.applicationUrl).toBe("munene.dev");
  });

  it("keeps it when the form sends it back unchanged", () => {
    const parsed = parseOpportunity({ ...opportunity, title: "New title" }, opportunity);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.applicationUrl).toBe("munene.dev");
  });

  it("refuses a new or changed non-http link, accepts http(s), and clears on empty", () => {
    expect(parseOpportunity({ applicationUrl: "other.dev" }, opportunity)).toMatch(/http/);
    expect(parseOpportunity({ title: "T", applicationUrl: "javascript:alert(1)" })).toMatch(/http/);
    const ok = parseOpportunity({ applicationUrl: "https://apply.example" }, opportunity);
    expect(typeof ok !== "string" && ok.applicationUrl).toBe("https://apply.example");
    const cleared = parseOpportunity({ applicationUrl: "" }, opportunity);
    expect(typeof cleared !== "string" && cleared.applicationUrl).toBeUndefined();
  });
});

const leader: Leader = {
  id: "ldr-1",
  slug: "jane",
  name: "Jane",
  honorific: "Hon.",
  position: "MCA",
  type: "elected",
  county: "Nairobi",
  photo: "",
  shortBio: "",
  bio: "",
  achievements: [],
  social: { x: "@jane", website: "https://jane.example" },
  projectIds: [],
  opportunityIds: [],
  mediaIds: [],
  pollIds: [],
  productIds: [],
};

describe("parseLeader social links", () => {
  it("keeps a stored non-http handle on an unrelated profile save", () => {
    const parsed = parseLeader({ bio: "New bio" }, leader, { stockPhoto: false });
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.social).toEqual({ x: "@jane", website: "https://jane.example" });
  });

  it("keeps it when the form sends the social links back with another key changed", () => {
    const parsed = parseLeader(
      { bio: "New bio", social: { x: "@jane", website: "https://new.example" } },
      leader,
      { stockPhoto: false }
    );
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.social).toEqual({ x: "@jane", website: "https://new.example" });
  });

  it("refuses a changed non-http link and clears an emptied one", () => {
    expect(parseLeader({ social: { x: "@someone" } }, leader)).toMatch(/X link/);
    const parsed = parseLeader({ social: { x: "" } }, leader);
    if (typeof parsed === "string") throw new Error(parsed);
    expect(parsed.social).toEqual({ website: "https://jane.example" });
  });
});
