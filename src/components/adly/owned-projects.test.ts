import { describe, expect, it } from "vitest";
import type { Project } from "@/types";
import { ownedProjects } from "@/components/adly/owned-projects";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function project(id: string, ownerUserId?: string): Project {
  return {
    id,
    slug: id,
    name: id,
    category: "infrastructure",
    subcategory: "roads",
    location: "",
    county: "Nairobi",
    status: "planned",
    progress: 0,
    image: "",
    description: "",
    startDate: "2026-01-01",
    expectedCompletion: "2026-12-01",
    leaderIds: [],
    geo: { center: { lat: 0, lng: 0 } },
    milestoneIds: [],
    opportunityIds: [],
    mediaIds: [],
    ...(ownerUserId ? { ownerUserId } : {}),
  } as Project;
}

const owned = project("owned", ME);
const commissioned = project("commissioned", OTHER);
const all = [owned, commissioned];

describe("ownedProjects (Adly studio project picker)", () => {
  it("Tracker: offers only projects the user owns, not commissioned ones on their profile", () => {
    const ids = ownedProjects({
      projects: all,
      isAdmin: false,
      userId: ME,
      leaderProjectIds: ["owned", "commissioned"],
      tracker: true,
    }).map((p) => p.id);
    expect(ids).toEqual(["owned"]);
  });

  it("Tracker: offers nothing when signed out", () => {
    expect(ownedProjects({ projects: all, isAdmin: false, tracker: true })).toEqual([]);
  });

  it("treats records carrying ownerUserId as Tracker even before the backend is known", () => {
    const ids = ownedProjects({
      projects: all,
      isAdmin: false,
      userId: ME,
      leaderProjectIds: ["owned", "commissioned"],
      tracker: false,
    }).map((p) => p.id);
    expect(ids).toEqual(["owned"]);
  });

  it("admins see every project", () => {
    expect(ownedProjects({ projects: all, isAdmin: true, userId: ME, tracker: true })).toEqual(all);
  });

  it("memory mode uses the leader profile's projectIds", () => {
    const memory = [project("a"), project("b")];
    const ids = ownedProjects({ projects: memory, isAdmin: false, userId: ME, leaderProjectIds: ["b"], tracker: false }).map(
      (p) => p.id
    );
    expect(ids).toEqual(["b"]);
  });
});
