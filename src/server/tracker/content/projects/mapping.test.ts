import { describe, expect, it } from "vitest";
import type { Project, ProjectMilestone } from "@/types";
import {
  boundaryToGeofence,
  buildInitiativeInsert,
  buildInitiativeUpdate,
  buildLocation,
  buildMilestoneInsert,
  buildMilestoneUpdate,
  categoryBucket,
  EMPTY_LINKS,
  geofenceToBoundary,
  INFRASTRUCTURE_CATEGORIES,
  INITIATIVE_STATUSES,
  isJunkArea,
  isPlaceholderPin,
  isTrackerCategory,
  KENYA_MAP_CENTER,
  locationLabel,
  mapInitiative,
  mapMilestone,
  mergeReferenceImages,
  milestoneCompletedAt,
  MILESTONE_STATUSES,
  milestoneNumbers,
  NAIROBI_CBD,
  parseLocation,
  parseSatelliteSnapshots,
  progressFromMilestones,
  ProjectInputError,
  projectGeo,
  readMilestoneStatus,
  readProjectStatus,
  resolveTrackerCategory,
  specificAreaFromLabel,
  toDateOnly,
  TRACKER_PROJECT_CATEGORIES,
  withoutColumns,
  writeMilestoneStatus,
  writeProjectStatus,
  type ProjectLinks,
} from "./mapping";
import type { InitiativeRow, MilestoneRow } from "./rows";

// Fixtures copy the shapes seen in the live initiatives / milestones rows on
// 2026-10-22 (key sets, junk specific_area values, placeholder pins, snapshot
// objects). Ids, titles, places and URLs are made up.
const ID = "11111111-2222-4333-8444-555555555555";
const CM = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TODAY = "2026-10-22";

const SNAPSHOT_BASELINE = {
  date: "2026-08-26",
  bounds: { east: 36.7934, west: 36.7845, north: -1.3085, south: -1.3174 },
  imageUrl: "https://example.test/sat/baseline.jpg",
  captured_at: "2026-08-26T03:04:05.300Z",
  cloudCoverage: 1.5,
  ai_analysis: { notes: "Initial satellite baseline.", status: "baseline", changePercentage: 0 },
};
const SNAPSHOT_PLAIN = {
  date: "2025-08-08",
  bounds: { east: 36.758, west: 36.743, north: -1.298, south: -1.312 },
  imageUrl: "https://example.test/sat/2025-08.png",
  cloudCoverage: 0,
};

function row(overrides: Partial<InitiativeRow> = {}): InitiativeRow {
  return {
    id: ID,
    changemaker_id: CM,
    title: "Kibera Water Kiosk Upgrade",
    short_description: "Upgrade of a community water kiosk.",
    description: "Upgrade of a community water kiosk.",
    category: "water",
    target_amount: 0,
    raised_amount: 0,
    location: {
      county: "Nairobi",
      constituency: "Kibra",
      specific_area: "Olympic Estate",
      coordinates: { lat: -1.313, lng: 36.789 },
    },
    project_duration: null,
    expected_completion: "2026-12-31",
    reference_images: ["https://example.test/img/1.jpg", "https://example.test/img/2.jpg"],
    payment_details: { method: "mpesa", mpesa_number: "+254700000000" },
    status: "published",
    created_at: "2026-08-26T03:00:00.000Z",
    updated_at: "2026-08-26T03:00:00.000Z",
    satellite_snapshots: [SNAPSHOT_BASELINE],
    opportunity_preferences: { acceptProposals: true, acceptAmbassadors: true, acceptContentCreators: true },
    ...overrides,
  };
}

function links(overrides: Partial<ProjectLinks> = {}): ProjectLinks {
  return { ...EMPTY_LINKS, ...overrides };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: ID,
    slug: "kibera-water-kiosk-upgrade",
    name: "Kibera Water Kiosk Upgrade",
    category: "infrastructure",
    subcategory: "water",
    location: "Olympic Estate, Kibra, Nairobi County",
    county: "Nairobi",
    status: "planned",
    progress: 0,
    image: "https://example.test/img/1.jpg",
    description: "Upgrade of a community water kiosk.",
    startDate: "2026-08-26",
    expectedCompletion: "2026-12-31",
    leaderIds: [],
    geo: { center: { lat: -1.313, lng: 36.789 } },
    milestoneIds: [],
    opportunityIds: [],
    mediaIds: [],
    ...overrides,
  };
}

describe("location shapes", () => {
  it("reads the common live shape", () => {
    const loc = parseLocation(row().location);
    expect(loc).toEqual({
      county: "Nairobi",
      constituency: "Kibra",
      ward: undefined,
      specificArea: "Olympic Estate",
      coordinates: { lat: -1.313, lng: 36.789 },
      geofence: undefined,
    });
    expect(locationLabel(loc)).toBe("Olympic Estate, Kibra, Nairobi County");
  });

  it("treats empty county / constituency as missing", () => {
    const loc = parseLocation({ county: "", constituency: "", specific_area: "", coordinates: { lat: -1.30577, lng: 36.75116 } });
    expect(loc.county).toBeUndefined();
    expect(loc.constituency).toBeUndefined();
    expect(locationLabel(loc)).toBe("");
    const mapped = mapInitiative(row({ location: { county: "", constituency: "", specific_area: "", coordinates: { lat: -1.30577, lng: 36.75116 } } }), links(), { slug: "x", today: TODAY });
    expect(mapped.county).toBe("");
    expect(mapped.location).toBe("");
    expect(mapped.geo.center).toEqual({ lat: -1.30577, lng: 36.75116 });
  });

  it("drops numeric and coordinate-like specific_area from the label", () => {
    expect(isJunkArea("601")).toBe(true);
    expect(isJunkArea("-1.313, 36.789")).toBe(true);
    expect(isJunkArea("-1.314, 36.790")).toBe(true);
    expect(isJunkArea("Stage 2 market")).toBe(false);
    expect(locationLabel(parseLocation({ county: "Embu", constituency: "Runyenjes", specific_area: "601" }))).toBe(
      "Runyenjes, Embu County"
    );
    expect(locationLabel(parseLocation({ county: "Nairobi", constituency: "Kibra", specific_area: "-1.313, 36.789" }))).toBe(
      "Kibra, Nairobi County"
    );
  });

  it("does not double the County suffix", () => {
    expect(locationLabel({ county: "Nairobi County" })).toBe("Nairobi County");
  });

  it("accepts string numbers, legacy coords and top-level lat/lng", () => {
    expect(parseLocation({ coordinates: { lat: "-0.27", lng: "37.4" } }).coordinates).toEqual({ lat: -0.27, lng: 37.4 });
    expect(parseLocation({ coords: { lat: 0.25, lng: 34.76 } }).coordinates).toEqual({ lat: 0.25, lng: 34.76 });
    expect(parseLocation({ lat: 0.14, lng: 34.7 }).coordinates).toEqual({ lat: 0.14, lng: 34.7 });
    expect(parseLocation({ coordinates: { lat: "", lng: 1 } }).coordinates).toBeUndefined();
    expect(parseLocation(null)).toEqual({});
    expect(parseLocation("Nairobi")).toEqual({});
  });

  it("ignores a geofence under 3 points", () => {
    expect(parseLocation({ geofence: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }] }).geofence).toBeUndefined();
  });
});

describe("placeholder pins", () => {
  it("matches the Tracker's placeholder test", () => {
    expect(isPlaceholderPin(NAIROBI_CBD)).toBe(true);
    expect(isPlaceholderPin(KENYA_MAP_CENTER)).toBe(true);
    expect(isPlaceholderPin({ lat: -1.28640, lng: 36.81720 })).toBe(true);
    expect(isPlaceholderPin(null)).toBe(true);
    expect(isPlaceholderPin({ lat: NaN, lng: 1 })).toBe(true);
    expect(isPlaceholderPin({ lat: -1.313, lng: 36.789 })).toBe(false);
  });

  it("gives no geo.center for the live {county, coordinates = NAIROBI_CBD} row", () => {
    const mapped = mapInitiative(
      row({ location: { county: "Nairobi", coordinates: { lat: -1.286389, lng: 36.817223 } } }),
      links(),
      { slug: "x", today: TODAY }
    );
    expect(mapped.geo.center).toBeUndefined();
    expect(mapped.location).toBe("Nairobi County");
    expect(projectGeo(parseLocation({ coordinates: KENYA_MAP_CENTER })).center).toBeUndefined();
  });

  it("refuses to create a project without a real pin", () => {
    expect(() => buildInitiativeInsert(project({ geo: { center: NAIROBI_CBD } }), { changemakerId: CM })).toThrow(
      ProjectInputError
    );
    expect(() =>
      buildInitiativeInsert(project({ geo: {} as Project["geo"] }), { changemakerId: CM })
    ).toThrow(/Drop a pin/);
  });

  it("keeps the stored pin when an update sends a placeholder or no center", () => {
    const existing = row().location;
    expect(buildLocation(existing, { label: "", county: "Nairobi", center: KENYA_MAP_CENTER }).coordinates).toEqual({
      lat: -1.313,
      lng: 36.789,
    });
    expect(buildLocation(existing, { label: "", county: "Nairobi" }).coordinates).toEqual({ lat: -1.313, lng: 36.789 });
  });
});

describe("boundary ↔ geofence", () => {
  const fence = [
    { lat: -1.31, lng: 36.78 },
    { lat: -1.31, lng: 36.79 },
    { lat: -1.32, lng: 36.79 },
  ];

  it("reads a geofence as a closed [lng, lat] polygon", () => {
    expect(geofenceToBoundary(fence)).toEqual({
      type: "Polygon",
      coordinates: [[[36.78, -1.31], [36.79, -1.31], [36.79, -1.32], [36.78, -1.31]]],
    });
  });

  it("writes a polygon as {lat, lng} without the closing point", () => {
    expect(boundaryToGeofence(geofenceToBoundary(fence))).toEqual(fence);
    expect(boundaryToGeofence({ type: "Polygon", coordinates: [[[36.78, -1.31], [36.79, -1.31], [36.78, -1.31]]] })).toBeUndefined();
  });

  it("rejects a boundary under 3 points and removes geofence when the boundary is cleared", () => {
    expect(() =>
      buildLocation(row().location, {
        label: "",
        county: "Nairobi",
        boundary: { type: "Polygon", coordinates: [[[1, 1], [2, 2], [1, 1]]] },
      })
    ).toThrow(/at least 3 points/);
    const withFence = { ...(row().location as object), geofence: fence };
    expect("geofence" in buildLocation(withFence, { label: "", county: "Nairobi" })).toBe(false);
    expect(buildLocation(withFence, { label: "", county: "Nairobi", boundary: geofenceToBoundary(fence) }).geofence).toEqual(fence);
  });
});

describe("location write keeps Tracker keys", () => {
  it("keeps unknown keys, constituency and ward", () => {
    const existing = { county: "Nairobi", constituency: "Kibra", ward: "Laini Saba", specific_area: "601", coordinates: { lat: -1.313, lng: 36.789 }, landmark: "Near the chief's camp" };
    const next = buildLocation(existing, { label: "Kibra, Nairobi County", county: "Nairobi", center: { lat: -1.313, lng: 36.789 } });
    expect(next).toEqual(existing);
  });

  it("strips the appended constituency and county from a new label", () => {
    expect(specificAreaFromLabel("Toi Market, Kibra, Nairobi County", { county: "Nairobi", constituency: "Kibra" })).toBe("Toi Market");
    const next = buildLocation(row().location, { label: "Toi Market, Kibra, Nairobi County", county: "Nairobi" });
    expect(next.specific_area).toBe("Toi Market");
    expect(next.constituency).toBe("Kibra");
  });

  it("writes the Tracker create shape for a new row", () => {
    expect(buildLocation(undefined, { label: "Ruiru", county: "Kiambu", center: { lat: -1.15, lng: 36.96 } })).toEqual({
      county: "Kiambu",
      constituency: "",
      specific_area: "Ruiru",
      coordinates: { lat: -1.15, lng: 36.96 },
    });
  });
});

describe("categories", () => {
  it("lists exactly the 58 check-constraint values", () => {
    expect(TRACKER_PROJECT_CATEGORIES).toHaveLength(58);
    for (const value of INFRASTRUCTURE_CATEGORIES) expect(isTrackerCategory(value)).toBe(true);
  });

  it("buckets per the doc", () => {
    for (const value of ["infrastructure", "roads", "water", "health", "housing", "irrigation"]) {
      expect(categoryBucket(value)).toBe("infrastructure");
    }
    for (const value of ["agriculture", "economic", "youth", "education", "other", "unknown", null]) {
      expect(categoryBucket(value)).toBe("non-infrastructure");
    }
  });

  it("resolves subcategories to a check value", () => {
    expect(resolveTrackerCategory({ subcategory: "roads", category: "infrastructure" })).toBe("roads");
    expect(resolveTrackerCategory({ subcategory: "Water supply" })).toBe("water");
    expect(resolveTrackerCategory({ subcategory: "Food security" })).toBe("food_security");
    expect(resolveTrackerCategory({ subcategory: "food security", category: "non-infrastructure" })).toBe("food_security");
    expect(resolveTrackerCategory({ subcategory: "Borehole drilling" })).toBe("water");
    expect(resolveTrackerCategory({ subcategory: "Market stalls" })).toBe("trade");
    expect(resolveTrackerCategory({ subcategory: "Footbridge" })).toBe("bridges");
    expect(resolveTrackerCategory({ subcategory: "School classrooms" })).toBe("education");
    expect(resolveTrackerCategory({ subcategory: "Something", category: "infrastructure" })).toBe("infrastructure");
    expect(resolveTrackerCategory({ subcategory: "", category: "non-infrastructure" })).toBe("other");
  });

  it("keeps the stored value when the free text says nothing new and the bucket still fits", () => {
    expect(resolveTrackerCategory({ subcategory: "Value chain", category: "non-infrastructure", existing: "agriculture" })).toBe(
      "agriculture"
    );
    expect(resolveTrackerCategory({ subcategory: "Value chain", category: "infrastructure", existing: "agriculture" })).toBe(
      "infrastructure"
    );
  });

  it("never returns a value outside the check list", () => {
    for (const subcategory of ["", "???", "Roads & bridges", "HEALTH", "Économie", "x".repeat(300)]) {
      for (const category of ["infrastructure", "non-infrastructure", undefined] as const) {
        expect(isTrackerCategory(resolveTrackerCategory({ subcategory, category, existing: "not-a-value" }))).toBe(true);
      }
    }
  });
});

describe("project status", () => {
  const facts = { milestoneStatuses: [] as string[], startDate: null, today: TODAY };

  it("reads Tracker statuses", () => {
    expect(readProjectStatus("draft", facts)).toBe("planned");
    expect(readProjectStatus("published", facts)).toBe("planned");
    expect(readProjectStatus("published", { ...facts, milestoneStatuses: ["pending", "in_progress"] })).toBe("in-progress");
    expect(readProjectStatus("published", { ...facts, milestoneStatuses: ["completed"] })).toBe("in-progress");
    expect(readProjectStatus("published", { ...facts, startDate: "2026-10-22" })).toBe("in-progress");
    expect(readProjectStatus("published", { ...facts, startDate: "2026-11-01" })).toBe("planned");
    expect(readProjectStatus("active", facts)).toBe("in-progress");
    expect(readProjectStatus("completed", facts)).toBe("completed");
    expect(readProjectStatus("stalled", facts)).toBe("on-hold");
  });

  it("writes Siasa statuses inside the check list", () => {
    expect(writeProjectStatus("planned")).toBe("published");
    expect(writeProjectStatus("in-progress")).toBe("active");
    expect(writeProjectStatus("completed")).toBe("completed");
    expect(writeProjectStatus("on-hold")).toBe("stalled");
    for (const s of ["planned", "in-progress", "completed", "on-hold"] as const) {
      expect(INITIATIVE_STATUSES).toContain(writeProjectStatus(s));
    }
  });

  it("keeps a stored status that already reads as the incoming one", () => {
    expect(writeProjectStatus("planned", { status: "draft", readsAs: "planned" })).toBe("draft");
    expect(writeProjectStatus("in-progress", { status: "published", readsAs: "in-progress" })).toBe("published");
    expect(writeProjectStatus("in-progress", { status: "draft", readsAs: "planned" })).toBe("active");
  });
});

describe("milestone status", () => {
  it("maps both ways inside the check list", () => {
    expect(readMilestoneStatus("completed")).toBe("completed");
    expect(readMilestoneStatus("in_progress")).toBe("current");
    expect(readMilestoneStatus("delayed")).toBe("current");
    expect(readMilestoneStatus("pending")).toBe("upcoming");
    expect(readMilestoneStatus("cancelled")).toBeUndefined();
    expect(writeMilestoneStatus("completed")).toBe("completed");
    expect(writeMilestoneStatus("current")).toBe("in_progress");
    expect(writeMilestoneStatus("upcoming")).toBe("pending");
    expect(writeMilestoneStatus("current", "delayed")).toBe("delayed");
    expect(writeMilestoneStatus("upcoming", "cancelled")).toBe("pending");
    for (const s of ["completed", "current", "upcoming"] as const) {
      expect(MILESTONE_STATUSES).toContain(writeMilestoneStatus(s, "delayed"));
    }
  });

  it("sets and clears completed_at like the Tracker", () => {
    const now = new Date("2026-10-22T10:00:00.000Z");
    expect(milestoneCompletedAt("completed", undefined, now)).toBe(now.toISOString());
    expect(milestoneCompletedAt("completed", { status: "completed", completed_at: "2026-01-01T00:00:00Z" }, now)).toBe(
      "2026-01-01T00:00:00Z"
    );
    expect(milestoneCompletedAt("in_progress", { status: "completed", completed_at: "2026-01-01T00:00:00Z" }, now)).toBeNull();
  });
});

describe("mapInitiative", () => {
  it("maps a live-like published row", () => {
    const mapped = mapInitiative(
      row(),
      links({
        leaderIds: ["f1"],
        milestones: [
          { id: "m2", status: "completed", target_date: "2026-09-15", created_at: "2026-08-26" },
          { id: "m1", status: "pending", target_date: "2024-03-01", created_at: "2026-01-29" },
          { id: "m3", status: "cancelled", target_date: "2025-01-01", created_at: "2026-01-29" },
        ],
        opportunityIds: ["o1"],
        mediaIds: ["b1"],
        hasPublishedOpportunity: true,
      }),
      { slug: "kibera-water-kiosk-upgrade", today: TODAY }
    );
    expect(mapped).toEqual({
      id: ID,
      slug: "kibera-water-kiosk-upgrade",
      name: "Kibera Water Kiosk Upgrade",
      category: "infrastructure",
      subcategory: "water",
      location: "Olympic Estate, Kibra, Nairobi County",
      county: "Nairobi",
      status: "in-progress",
      progress: 50,
      image: "https://example.test/img/1.jpg",
      description: "Upgrade of a community water kiosk.",
      startDate: "2026-08-26",
      expectedCompletion: "2026-12-31",
      leaderIds: ["f1"],
      geo: { center: { lat: -1.313, lng: 36.789 } },
      milestoneIds: ["m1", "m2"],
      opportunityIds: ["o1"],
      mediaIds: ["b1"],
      requiresOpportunities: true,
    });
  });

  it("uses NEW columns when present", () => {
    const mapped = mapInitiative(row({ start_date: "2026-01-10", progress_percent: 73 }), links(), { slug: "x", today: TODAY });
    expect(mapped.startDate).toBe("2026-01-10");
    expect(mapped.progress).toBe(73);
    expect(mapped.status).toBe("in-progress");
  });

  it("falls back to the satellite frame for the image and allows no leaders", () => {
    const mapped = mapInitiative(row({ reference_images: [] }), links(), { slug: "x", today: TODAY });
    expect(mapped.image).toBe(SNAPSHOT_BASELINE.imageUrl);
    expect(mapped.leaderIds).toEqual([]);
    expect(mapInitiative(row({ reference_images: null, satellite_snapshots: [] }), links(), { slug: "x", today: TODAY }).image).toBe("");
  });

  it("does not use funding completion as build progress", () => {
    expect(mapInitiative(row({ target_amount: 100, raised_amount: 100 }), links(), { slug: "x", today: TODAY }).progress).toBe(0);
    expect(progressFromMilestones(["completed", "completed", "pending", "cancelled"])).toBe(67);
  });
});

describe("initiative writes", () => {
  it("round-trips a mapped project into an empty patch", () => {
    const existing = row({ location: { ...(row().location as object), ward: "Laini Saba", specific_area: "601" } });
    const l = links({ milestones: [{ id: "m1", status: "pending", target_date: "2026-09-15", created_at: null }] });
    const mapped = mapInitiative(existing, l, { slug: "x", today: TODAY });
    expect(buildInitiativeUpdate(existing, mapped, { links: l, today: TODAY })).toEqual({});
  });

  it("round-trips the placeholder-pin row without touching its coordinates", () => {
    const existing = row({ location: { county: "Nairobi", coordinates: { lat: -1.286389, lng: 36.817223 } } });
    const mapped = mapInitiative(existing, links(), { slug: "x", today: TODAY });
    const patch = buildInitiativeUpdate(existing, mapped, { links: links(), today: TODAY });
    expect(patch.location).toEqual({
      county: "Nairobi",
      coordinates: { lat: -1.286389, lng: 36.817223 },
      constituency: "",
      specific_area: "",
    });
  });

  it("writes only changed scalar columns and never Tracker-only ones", () => {
    const patch = buildInitiativeUpdate(
      row(),
      project({ name: "Kibera Water Kiosk Phase 2", status: "on-hold", subcategory: "sanitation", image: "https://example.test/img/new.jpg" }),
      { links: links(), today: TODAY }
    );
    expect(patch).toEqual({
      title: "Kibera Water Kiosk Phase 2",
      category: "sanitation",
      status: "stalled",
      reference_images: ["https://example.test/img/new.jpg", "https://example.test/img/1.jpg", "https://example.test/img/2.jpg"],
    });
    for (const column of ["target_amount", "raised_amount", "payment_details", "satellite_snapshots", "project_duration", "opportunity_preferences", "changemaker_id"]) {
      expect(column in patch).toBe(false);
    }
  });

  it("updates short_description with the description", () => {
    const long = "A".repeat(300);
    const patch = buildInitiativeUpdate(row(), project({ description: long }), { links: links(), today: TODAY });
    expect(patch.description).toBe(long);
    expect(patch.short_description).toBe("A".repeat(240));
  });

  it("writes NEW columns only when the row has them", () => {
    const before = buildInitiativeUpdate(row(), project({ startDate: "2026-01-10", progress: 40 }), { links: links(), today: TODAY });
    expect("start_date" in before).toBe(false);
    expect("progress_percent" in before).toBe(false);
    const after = buildInitiativeUpdate(
      row({ start_date: null, progress_percent: null }),
      project({ startDate: "2026-01-10", progress: 40 }),
      { links: links(), today: TODAY }
    );
    expect(after.start_date).toBe("2026-01-10");
    expect(after.progress_percent).toBe(40);
  });

  it("does not store the created_at fallback or derived progress as real values", () => {
    const existing = row({ start_date: null, progress_percent: null });
    const patch = buildInitiativeUpdate(existing, project({ startDate: "2026-08-26", progress: 0 }), { links: links(), today: TODAY });
    expect(patch).toEqual({});
  });

  it("builds the Tracker create payload", () => {
    const payload = buildInitiativeInsert(
      project({ description: "B".repeat(260), subcategory: "Roads", status: "in-progress", progress: 0 }),
      { changemakerId: CM }
    );
    expect(payload).toMatchObject({
      changemaker_id: CM,
      title: "Kibera Water Kiosk Upgrade",
      short_description: "B".repeat(240),
      category: "roads",
      status: "active",
      target_amount: 0,
      expected_completion: "2026-12-31",
      reference_images: ["https://example.test/img/1.jpg"],
      start_date: "2026-08-26",
    });
    expect("progress_percent" in payload).toBe(false);
    expect("raised_amount" in payload).toBe(false);
    expect(withoutColumns(payload, ["start_date", "progress_percent"])).not.toHaveProperty("start_date");
  });
});

describe("images", () => {
  it("puts the Siasa image first, keeps the rest, caps at 5", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(mergeReferenceImages(six, "z")).toEqual(["z", "a", "b", "c", "d"]);
    expect(mergeReferenceImages(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(mergeReferenceImages(["a", " ", null], "")).toEqual(["a"]);
  });
});

describe("satellite snapshots", () => {
  it("keeps both live shapes and every key", () => {
    const parsed = parseSatelliteSnapshots([SNAPSHOT_PLAIN, SNAPSHOT_BASELINE, { date: "x" }, { imageUrl: "" }, null]);
    expect(parsed).toEqual([SNAPSHOT_PLAIN, SNAPSHOT_BASELINE]);
    expect(parseSatelliteSnapshots({})).toEqual([]);
  });
});

describe("milestones", () => {
  const base: MilestoneRow = {
    id: "m1",
    initiative_id: ID,
    title: "Site survey",
    target_date: "2026-09-15",
    status: "pending",
    description: null,
    completed_at: null,
    created_at: "2026-08-26T03:00:53Z",
  };

  it("numbers per project by target_date then created_at, skipping cancelled", () => {
    const numbers = milestoneNumbers([
      { ...base, id: "b", target_date: "2026-02-01", created_at: "2026-01-02" },
      { ...base, id: "a", target_date: "2026-02-01", created_at: "2026-01-01" },
      { ...base, id: "x", status: "cancelled", target_date: "2026-01-01" },
      { ...base, id: "c", target_date: "2026-01-15" },
      { ...base, id: "o", initiative_id: "other", target_date: "2030-01-01" },
    ]);
    expect(Object.fromEntries(numbers)).toEqual({ c: 1, a: 2, b: 3, o: 1 });
  });

  it("maps a live-like row and hides cancelled ones", () => {
    expect(mapMilestone(base, 1)).toEqual({
      id: "m1",
      projectId: ID,
      number: 1,
      date: "2026-09-15",
      title: "Site survey",
      description: "",
      status: "upcoming",
    });
    expect(mapMilestone({ ...base, image_url: "https://example.test/m.jpg" }, 1)?.image).toBe("https://example.test/m.jpg");
    expect(mapMilestone({ ...base, status: "cancelled" }, 0)).toBeUndefined();
  });

  it("builds insert and minimal update payloads", () => {
    const now = new Date("2026-10-22T10:00:00.000Z");
    const item: ProjectMilestone = { id: "ms-1", projectId: ID, number: 1, date: "2026-11", title: " Handover ", description: "", status: "completed" };
    expect(buildMilestoneInsert(item, now)).toEqual({
      initiative_id: ID,
      title: "Handover",
      target_date: "2026-11-01",
      description: null,
      status: "completed",
      completed_at: now.toISOString(),
    });
    const same = mapMilestone(base, 1) as ProjectMilestone;
    expect(buildMilestoneUpdate(base, same, now)).toEqual({});
    expect(buildMilestoneUpdate({ ...base, status: "delayed" }, { ...same, status: "current" }, now)).toEqual({});
    expect(buildMilestoneUpdate(base, { ...same, status: "current", image: "https://example.test/m.jpg" }, now)).toEqual({
      status: "in_progress",
    });
    expect(buildMilestoneUpdate({ ...base, image_url: null }, { ...same, image: "https://example.test/m.jpg" }, now)).toEqual({
      image_url: "https://example.test/m.jpg",
    });
    expect(() => buildMilestoneInsert({ ...item, date: "soon" }, now)).toThrow(ProjectInputError);
    expect(() => buildMilestoneInsert({ ...item, title: " " }, now)).toThrow(ProjectInputError);
  });

  it("normalises dates", () => {
    expect(toDateOnly("2026-08-26T03:00:00.000Z")).toBe("2026-08-26");
    expect(toDateOnly("2026-08")).toBe("2026-08-01");
    expect(toDateOnly("")).toBeUndefined();
    expect(toDateOnly(null)).toBeUndefined();
  });
});
