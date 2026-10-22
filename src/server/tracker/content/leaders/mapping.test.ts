import { describe, expect, it } from "vitest";
import type { Leader } from "@/types";
import {
  FIGURE_POSITIONS,
  formatPosition,
  isNoopWrite,
  leaderToRow,
  positionFromOffice,
  rowToLeader,
  splitManifesto,
  statusFromType,
  writeManifesto,
  type FigureRow,
  type FigureWrite,
} from "@/server/tracker/content/leaders/mapping";

const NOW = new Date("2026-10-22T08:30:00.000Z");

/** Shaped like a live seeded row (no user, pre-M3 columns only). Synthetic values. */
function seededRow(overrides: Partial<FigureRow> = {}): FigureRow {
  return {
    id: "6f1d2c3b-1111-4aaa-8bbb-000000000001",
    user_id: null,
    name: "Amina Wanjiru",
    position: "governor",
    county: "Kiambu",
    constituency: null,
    ward: null,
    term_start: "2022-08-25",
    term_end: "2027-08-25",
    term_years: 5,
    manifesto: {
      text: "",
      targets: [],
      focus_areas: [],
      uploaded_at: "2025-11-02T10:00:00.000Z",
    },
    commissioned_projects: [],
    status: "active",
    created_at: "2025-11-02T10:00:00.000Z",
    updated_at: "2025-11-02T10:00:00.000Z",
    ...overrides,
  };
}

/** Shaped like a newer signup row (has party, office_label, hero_title), with M3/M5 columns applied. */
function signupRow(overrides: Partial<FigureRow> = {}): FigureRow {
  return seededRow({
    id: "6f1d2c3b-2222-4aaa-8bbb-000000000002",
    user_id: "9a9a9a9a-0000-4000-8000-000000000002",
    name: "Hon. Peter Kamau",
    position: "senator",
    county: "Nyeri",
    manifesto: {
      text: "Clean water for every ward.\n\nJobs for young people.\n\n\nRoads that last.",
      party: "Example Party",
      targets: [{ description: "Boreholes", quantity: 40, category: "water" }],
      focus_areas: [{ category: "water", priority: 5, commitments: [], keywords: [] }],
      hero_title: "A county that works",
      uploaded_at: "2026-03-01T09:00:00.000Z",
      office_label: "Senator, Nyeri County",
    },
    honorific: "Hon.",
    office_title: null,
    profile_image_url: "https://example.supabase.co/storage/v1/object/public/initiative-images/u/2026-03/a.jpg",
    cover_image_url: null,
    short_bio: "Senator for Nyeri.",
    bio: "Long bio.",
    achievements: ["Built 12 classrooms"],
    social_links: { x: "https://x.com/example", youtube: "https://youtube.com/@example" },
    vision: {
      priorities: ["Water", "Jobs"],
      expectedImpact: ["10,000 households served"],
      proposedProjects: [
        {
          id: "prop-1",
          title: "Mweiga water pan",
          description: "Rainwater storage.",
          location: "Mweiga",
          category: "infrastructure",
          simulationImage: "",
          expectedImpact: "2,000 households",
        },
      ],
    },
    ...overrides,
  });
}

describe("positionFromOffice", () => {
  it.each([
    ["Deputy President", "deputy_president"],
    ["President of the Republic", "president"],
    ["Presidential aspirant", "president"],
    ["Deputy Governor, Kisumu", "deputy_governor"],
    ["Governor", "governor"],
    ["governor aspirant – Nakuru", "governor"],
    ["Senator", "senator"],
    ["Women Rep, Kiambu", "woman_representative"],
    ["Woman Representative", "woman_representative"],
    ["MCA, Kileleshwa Ward", "mca"],
    ["Member of County Assembly", "mca"],
    ["Ward Rep", "mca"],
    ["MP, Westlands", "mp"],
    ["Member of Parliament", "mp"],
    ["National Assembly", "mp"],
  ])("%s -> %s", (office, position) => {
    expect(positionFromOffice(office)).toBe(position);
  });

  it("does not match inside other words", () => {
    expect(positionFromOffice("Champion of youth")).toBeUndefined(); // contains "mp"
    expect(positionFromOffice("Community organiser")).toBeUndefined();
    expect(positionFromOffice("")).toBeUndefined();
    expect(positionFromOffice(undefined)).toBeUndefined();
  });

  it("formatPosition output maps back to the same CHECK value for all 8", () => {
    for (const position of FIGURE_POSITIONS) {
      expect(positionFromOffice(formatPosition(position))).toBe(position);
    }
  });
});

describe("statusFromType", () => {
  it("follows §3", () => {
    expect(statusFromType("aspirant", "active")).toBe("aspirant");
    expect(statusFromType("elected", "seeking_reelection")).toBe("seeking_reelection");
    expect(statusFromType("elected", "active")).toBe("active");
    expect(statusFromType("elected", "aspirant")).toBe("active");
    expect(statusFromType("elected")).toBe("active");
  });

  it("keeps inactive / former unless the caller may reactivate (admins)", () => {
    expect(statusFromType("elected", "inactive")).toBe("inactive");
    expect(statusFromType("elected", "former")).toBe("former");
    expect(statusFromType("elected", "inactive", { canReactivate: true })).toBe("active");
    expect(statusFromType("elected", "former", { canReactivate: true })).toBe("active");
    expect(statusFromType("aspirant", "former")).toBe("aspirant");
  });
});

describe("rowToLeader", () => {
  it("maps a seeded row with no user and no new columns", () => {
    const leader = rowToLeader(seededRow());
    expect(leader).toEqual({
      id: "6f1d2c3b-1111-4aaa-8bbb-000000000001",
      slug: "amina-wanjiru",
      name: "Amina Wanjiru",
      honorific: "",
      position: "Governor",
      type: "elected",
      county: "Kiambu",
      constituency: undefined,
      ward: undefined,
      photo: "",
      coverImage: undefined,
      shortBio: "",
      bio: "",
      achievements: [],
      social: {},
      projectIds: [],
      opportunityIds: [],
      mediaIds: [],
      pollIds: [],
      productIds: [],
    });
    expect(leader.vision).toBeUndefined();
  });

  it("reads office_label when office_title is empty, and office_title first", () => {
    expect(rowToLeader(signupRow()).position).toBe("Senator, Nyeri County");
    expect(rowToLeader(signupRow({ office_title: "Senator" })).position).toBe("Senator");
  });

  it("maps status to type", () => {
    expect(rowToLeader(seededRow({ status: "aspirant" })).type).toBe("aspirant");
    for (const status of ["active", "seeking_reelection", "inactive"]) {
      expect(rowToLeader(seededRow({ status })).type).toBe("elected");
    }
  });

  it("reads vision from manifesto + vision column and drops blank paragraphs", () => {
    const leader = rowToLeader(signupRow());
    expect(leader.vision).toEqual({
      statement: "A county that works",
      manifesto: ["Clean water for every ward.", "Jobs for young people.", "Roads that last."],
      priorities: ["Water", "Jobs"],
      expectedImpact: ["10,000 households served"],
      proposedProjects: [
        {
          id: "prop-1",
          title: "Mweiga water pan",
          description: "Rainwater storage.",
          location: "Mweiga",
          category: "infrastructure",
          simulationImage: "",
          expectedImpact: "2,000 households",
        },
      ],
    });
    expect(leader.social).toEqual({ x: "https://x.com/example" });
  });

  it("falls back to profiles.bio and takes links and a route slug", () => {
    const leader = rowToLeader(signupRow({ bio: null }), {
      profileBio: "Profile bio",
      slug: "hon-peter-kamau-6f1d2c3b",
      links: { projectIds: ["p1"], opportunityIds: [], mediaIds: ["m1"], pollIds: [], productIds: [] },
    });
    expect(leader.bio).toBe("Profile bio");
    expect(leader.slug).toBe("hon-peter-kamau-6f1d2c3b");
    expect(leader.projectIds).toEqual(["p1"]);
    expect(leader.mediaIds).toEqual(["m1"]);
  });

  it("falls back to the short id when the name has no slug characters", () => {
    expect(rowToLeader(seededRow({ name: "—" })).slug).toBe("6f1d2c3b");
  });

  it("ignores junk in the vision column", () => {
    const leader = rowToLeader(
      seededRow({
        vision: { priorities: ["", 3, " Health "], proposedProjects: [{ title: "" }, "x", { title: "Clinic", category: "weird" }] },
      })
    );
    expect(leader.vision?.priorities).toEqual(["Health"]);
    expect(leader.vision?.proposedProjects).toEqual([
      {
        id: "proposed-3",
        title: "Clinic",
        description: "",
        location: "",
        category: "infrastructure",
        simulationImage: "",
        expectedImpact: "",
      },
    ]);
  });
});

function apply(row: FigureRow, patch: FigureWrite): FigureRow {
  return { ...row, ...patch } as FigureRow;
}

describe("leaderToRow", () => {
  it("round-trips a full row: write(read(row)) is a no-op", () => {
    const row = signupRow({ office_title: "Senator, Nyeri County" });
    const result = leaderToRow(rowToLeader(row), row, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(isNoopWrite(result.row, row)).toBe(true);
  });

  it("round-trips a Leader: read(write(leader)) gives the same leader", () => {
    const row = signupRow();
    const edited: Leader = {
      ...rowToLeader(row),
      honorific: "H.E.",
      position: "Governor, Nyeri County",
      type: "aspirant",
      constituency: "Mathira",
      coverImage: "https://example.com/cover.jpg",
      achievements: ["One", "Two"],
      social: { x: "https://x.com/new", website: "https://example.com" },
      vision: {
        statement: "New statement",
        manifesto: ["First.", "Second\nwith a line break."],
        priorities: ["Health"],
        proposedProjects: [],
        expectedImpact: [],
      },
    };
    const result = leaderToRow(edited, row, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    const saved = apply(row, result.row);
    expect(saved.position).toBe("governor");
    expect(saved.status).toBe("aspirant");
    expect(rowToLeader(saved)).toEqual(edited);
  });

  it("keeps Tracker-only manifesto keys and unknown social keys", () => {
    const row = signupRow();
    const leader = rowToLeader(row);
    leader.vision = { ...leader.vision!, statement: "", manifesto: ["Only one paragraph."] };
    leader.social = {};
    const result = leaderToRow(leader, row, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(result.row.manifesto).toEqual({
      text: "Only one paragraph.",
      party: "Example Party",
      targets: row.manifesto!.targets,
      focus_areas: row.manifesto!.focus_areas,
      uploaded_at: "2026-03-01T09:00:00.000Z",
      office_label: "Senator, Nyeri County",
    });
    expect(result.row.social_links).toEqual({ youtube: "https://youtube.com/@example" });
  });

  it("keeps the stored manifesto text byte for byte when the paragraphs did not change", () => {
    const row = signupRow();
    const result = leaderToRow(rowToLeader(row), row, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(result.row.manifesto?.text).toBe(row.manifesto!.text);
  });

  it("leaves manifesto and vision alone when the leader has no vision", () => {
    const row = seededRow({ manifesto: { text: "Slogan", party: "P", targets: [], focus_areas: [] } });
    const leader = { ...rowToLeader(row), vision: undefined };
    const result = leaderToRow(leader, row, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(result.row).not.toHaveProperty("manifesto");
    expect(result.row).not.toHaveProperty("vision");
  });

  it("keeps the existing position when the office text matches nothing", () => {
    const row = seededRow();
    const result = leaderToRow({ ...rowToLeader(row), position: "Community champion" }, row, { now: NOW });
    expect(result.ok && result.row.position).toBe("governor");
    expect(result.ok && result.row.office_title).toBe("Community champion");
  });

  it("rejects a new leader whose office matches nothing", () => {
    const leader = { ...rowToLeader(seededRow()), position: "Community champion" };
    expect(leaderToRow(leader, null, { now: NOW })).toEqual({
      ok: false,
      error: "Name the office, e.g. MCA, MP, Governor",
    });
    expect(leaderToRow({ ...leader, position: "" }, null, { now: NOW }).ok).toBe(false);
  });

  it("never writes a position outside the CHECK list", () => {
    const offices = ["Vice President", "MCA", "mp", "Women rep", "Senator", "Gov", "x", "Deputy Governor"];
    for (const office of offices) {
      const result = leaderToRow({ ...rowToLeader(seededRow()), position: office }, seededRow(), { now: NOW });
      if (result.ok) expect(FIGURE_POSITIONS).toContain(result.row.position);
    }
  });

  it("on create fills the NOT NULL term columns and a default manifesto", () => {
    const leader = { ...rowToLeader(seededRow()), position: "MCA, Kileleshwa" };
    const result = leaderToRow(leader, null, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(result.row).toMatchObject({
      position: "mca",
      status: "active",
      term_start: "2026-10-22",
      term_end: "2031-10-22",
      term_years: 5,
      manifesto: { text: "", focus_areas: [], targets: [], uploaded_at: NOW.toISOString() },
    });
    expect(result.row).not.toHaveProperty("id");
    expect(result.row).not.toHaveProperty("user_id");
  });

  it("never touches term columns on update", () => {
    const row = seededRow();
    const result = leaderToRow(rowToLeader(row), row, { now: NOW });
    if (!result.ok) throw new Error(result.error);
    expect(result.row).not.toHaveProperty("term_start");
    expect(result.row).not.toHaveProperty("term_end");
    expect(result.row).not.toHaveProperty("term_years");
  });

  it("drops the §17 columns when newColumns is false", () => {
    const row = seededRow();
    const leader = { ...rowToLeader(row), honorific: "Hon.", bio: "x", vision: { statement: "S", manifesto: [], priorities: [], proposedProjects: [], expectedImpact: [] } };
    const result = leaderToRow(leader, row, { now: NOW, newColumns: false });
    if (!result.ok) throw new Error(result.error);
    expect(Object.keys(result.row).sort()).toEqual(
      ["constituency", "county", "manifesto", "name", "position", "status", "ward"].sort()
    );
    expect(result.row.manifesto?.hero_title).toBe("S");
  });

  it("an unchanged live row (pre-migration) is a no-op write", () => {
    const row = seededRow();
    const result = leaderToRow(rowToLeader(row), row, { now: NOW, newColumns: false });
    if (!result.ok) throw new Error(result.error);
    expect(isNoopWrite(result.row, row)).toBe(true);
  });
});

describe("manifesto helpers", () => {
  it("splits on blank lines including CRLF and whitespace-only lines", () => {
    expect(splitManifesto("a\r\n\r\nb\n \nc\nd")).toEqual(["a", "b", "c\nd"]);
    expect(splitManifesto(null)).toEqual([]);
  });

  it("creates a default manifesto object when the row has none", () => {
    expect(
      writeManifesto({ statement: "T", manifesto: ["x"], priorities: [], proposedProjects: [], expectedImpact: [] }, null, NOW)
    ).toEqual({ text: "x", hero_title: "T", focus_areas: [], targets: [], uploaded_at: NOW.toISOString() });
  });
});

describe("no-op detection on live-shaped rows (finding 3)", () => {
  /** Post-migration row as most live rows will look: new columns present but empty. */
  function migratedEmptyRow(overrides: Partial<FigureRow> = {}): FigureRow {
    return seededRow({
      user_id: "9a9a9a9a-0000-4000-8000-000000000009",
      honorific: null,
      office_title: null,
      profile_image_url: null,
      cover_image_url: null,
      short_bio: null,
      bio: null,
      achievements: null,
      social_links: null,
      vision: null,
      ...overrides,
    });
  }

  function roundTrip(row: FigureRow, profileBio?: string) {
    const result = leaderToRow(rowToLeader(row, { profileBio }), row, { now: NOW, profileBio });
    if (!result.ok) throw new Error(result.error);
    return result.row;
  }

  it("null office_title: the formatted position is not written back", () => {
    const row = migratedEmptyRow();
    const patch = roundTrip(row);
    expect(patch).not.toHaveProperty("office_title");
    expect(isNoopWrite(patch, row)).toBe(true);
  });

  it("null office_title with manifesto.office_label: the label is not copied into office_title", () => {
    const row = migratedEmptyRow({
      position: "senator",
      manifesto: { text: "", targets: [], focus_areas: [], office_label: "Senator, Nyeri County" },
    });
    expect(isNoopWrite(roundTrip(row), row)).toBe(true);
  });

  it("null vision with manifesto text: no empty vision object is written", () => {
    const row = migratedEmptyRow({
      manifesto: { text: "Water first.\n\nThen roads.", hero_title: "Hope", targets: [], focus_areas: [] },
    });
    const patch = roundTrip(row);
    expect(patch).not.toHaveProperty("vision");
    expect(isNoopWrite(patch, row)).toBe(true);
  });

  it("null bio with profiles.bio present: the profile bio is never persisted", () => {
    const row = migratedEmptyRow();
    const patch = roundTrip(row, "Bio from profiles");
    expect(patch).not.toHaveProperty("bio");
    expect(isNoopWrite(patch, row)).toBe(true);
  });

  it("all three at once, before and after the migration", () => {
    const manifesto = { text: "One.\n\nTwo.", targets: [], focus_areas: [], uploaded_at: "2025-11-02T10:00:00.000Z" };
    const after = migratedEmptyRow({ manifesto });
    expect(isNoopWrite(roundTrip(after, "Profile bio"), after)).toBe(true);
    const before = seededRow({ user_id: "9a9a9a9a-0000-4000-8000-000000000009", manifesto });
    expect(isNoopWrite(roundTrip(before, "Profile bio"), before)).toBe(true);
  });

  it("an existing manifesto without text keeps it absent", () => {
    const row = migratedEmptyRow({ manifesto: { hero_title: "Hope", party: "P" } });
    const patch = roundTrip(row);
    expect(isNoopWrite(patch, row)).toBe(true);
  });

  it("still writes real changes", () => {
    const row = migratedEmptyRow();
    const leader = rowToLeader(row, { profileBio: "Profile bio" });
    const edited = {
      ...leader,
      position: "Governor, Kiambu County",
      bio: "My own bio",
      vision: { statement: "", manifesto: [], priorities: ["Water"], proposedProjects: [], expectedImpact: [] },
    };
    const result = leaderToRow(edited, row, { now: NOW, profileBio: "Profile bio" });
    if (!result.ok) throw new Error(result.error);
    expect(result.row).toMatchObject({
      office_title: "Governor, Kiambu County",
      position: "governor",
      bio: "My own bio",
      vision: { priorities: ["Water"], proposedProjects: [], expectedImpact: [] },
    });
  });

  it("clearing a bio that fell back to profiles.bio stores null, not the profile bio", () => {
    const row = migratedEmptyRow({ bio: "Own bio" });
    const result = leaderToRow({ ...rowToLeader(row), bio: "" }, row, { now: NOW, profileBio: "Profile bio" });
    expect(result.ok && result.row.bio).toBeNull();
  });

  it("a non-admin save keeps an inactive row inactive; an admin save reactivates", () => {
    const row = migratedEmptyRow({ status: "inactive" });
    const leader = { ...rowToLeader(row), shortBio: "Changed" };
    const mine = leaderToRow(leader, row, { now: NOW });
    expect(mine.ok && mine.row.status).toBe("inactive");
    expect(isNoopWrite(roundTrip(row), row)).toBe(true);
    const admin = leaderToRow(leader, row, { now: NOW, canReactivate: true });
    expect(admin.ok && admin.row.status).toBe("active");
  });
});
