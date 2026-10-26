import type {
  GeoBounds,
  GeoPoint,
  MilestoneStatus,
  Project,
  ProjectCategory,
  ProjectMilestone,
  ProjectStatus,
} from "@/types";
import type { InitiativeRow, MilestoneRow } from "./rows";

/**
 * Pure mappers between Siasa Project / ProjectMilestone and the Tracker
 * `initiatives` / `milestones` rows. Rules follow docs/content-mapping.md §4–§5.
 * Nothing here touches the network, so every rule is unit tested.
 */

export type Json = Record<string, unknown>;
export type LatLng = { lat: number; lng: number };

/** A value the Tracker cannot store. HTTP 400. */
export class ProjectInputError extends Error {
  readonly status = 400 as const;
}

export function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Categories (initiatives_category_check, Tracker src/lib/projectCategories.ts)

export const TRACKER_PROJECT_CATEGORIES = [
  { value: "agriculture", label: "Agriculture" },
  { value: "livestock", label: "Livestock" },
  { value: "fisheries", label: "Fisheries & aquaculture" },
  { value: "forestry", label: "Forestry" },
  { value: "food_security", label: "Food security & nutrition" },
  { value: "irrigation", label: "Irrigation" },
  { value: "water", label: "Water supply" },
  { value: "sanitation", label: "Sanitation" },
  { value: "waste_management", label: "Waste management" },
  { value: "health", label: "Health facilities" },
  { value: "maternal_health", label: "Maternal & child health" },
  { value: "mental_health", label: "Mental health" },
  { value: "nutrition", label: "Public nutrition" },
  { value: "hiv_aids", label: "HIV / AIDS & infectious disease" },
  { value: "education", label: "Education" },
  { value: "early_childhood", label: "Early childhood" },
  { value: "vocational_training", label: "Vocational & TVET" },
  { value: "research", label: "Research & higher education" },
  { value: "infrastructure", label: "General infrastructure" },
  { value: "roads", label: "Roads" },
  { value: "bridges", label: "Bridges" },
  { value: "transport", label: "Public transport" },
  { value: "energy", label: "Energy" },
  { value: "electricity", label: "Electricity / grid" },
  { value: "broadband", label: "Broadband & connectivity" },
  { value: "technology", label: "Technology & ICT" },
  { value: "digital_inclusion", label: "Digital inclusion" },
  { value: "innovation", label: "Innovation & startups" },
  { value: "economic", label: "Economic development" },
  { value: "trade", label: "Trade & markets" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "mining", label: "Mining & extractives" },
  { value: "finance", label: "Finance & cooperatives" },
  { value: "youth", label: "Youth livelihoods" },
  { value: "environment", label: "Environment" },
  { value: "climate", label: "Climate action" },
  { value: "conservation", label: "Conservation" },
  { value: "wildlife", label: "Wildlife" },
  { value: "disaster_relief", label: "Disaster relief & resilience" },
  { value: "housing", label: "Housing" },
  { value: "urban_planning", label: "Urban planning" },
  { value: "land", label: "Land & tenure" },
  { value: "rural_development", label: "Rural development" },
  { value: "governance", label: "Governance" },
  { value: "justice", label: "Justice & legal aid" },
  { value: "security", label: "Security & policing" },
  { value: "peacebuilding", label: "Peacebuilding" },
  { value: "human_rights", label: "Human rights" },
  { value: "social_welfare", label: "Social welfare" },
  { value: "community_development", label: "Community development" },
  { value: "gender_equality", label: "Gender equality" },
  { value: "disability_inclusion", label: "Disability inclusion" },
  { value: "sports", label: "Sports & recreation" },
  { value: "culture", label: "Culture & heritage" },
  { value: "arts", label: "Arts & creative" },
  { value: "tourism", label: "Tourism" },
  { value: "media", label: "Media & communications" },
  { value: "other", label: "Other" },
] as const;

export type TrackerCategory = (typeof TRACKER_PROJECT_CATEGORIES)[number]["value"];

const CATEGORY_VALUES = new Set<string>(TRACKER_PROJECT_CATEGORIES.map((c) => c.value));
const CATEGORY_BY_LABEL = new Map<string, TrackerCategory>(
  TRACKER_PROJECT_CATEGORIES.map((c) => [c.label.toLowerCase(), c.value])
);

/** §4: Tracker values that count as Siasa `infrastructure`. Everything else is non-infrastructure. */
export const INFRASTRUCTURE_CATEGORIES: ReadonlySet<string> = new Set([
  "infrastructure",
  "roads",
  "bridges",
  "transport",
  "energy",
  "electricity",
  "broadband",
  "water",
  "sanitation",
  "waste_management",
  "irrigation",
  "housing",
  "urban_planning",
  "health",
]);

/** §4 keyword import map for free-text subcategories, checked in this order. */
const CATEGORY_KEYWORDS: [RegExp, TrackerCategory][] = [
  [/road/, "roads"],
  [/water|borehole/, "water"],
  [/health/, "health"],
  [/market/, "trade"],
  [/youth/, "youth"],
  [/school/, "education"],
  [/bridge/, "bridges"],
  [/housing/, "housing"],
];

export function isTrackerCategory(value: unknown): value is TrackerCategory {
  return typeof value === "string" && CATEGORY_VALUES.has(value);
}

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "Other";
  return TRACKER_PROJECT_CATEGORIES.find((c) => c.value === value)?.label ?? value.replace(/_/g, " ");
}

export function categoryBucket(value: string | null | undefined): ProjectCategory {
  return value && INFRASTRUCTURE_CATEGORIES.has(value) ? "infrastructure" : "non-infrastructure";
}

function categoryFromText(sub: string): TrackerCategory | undefined {
  const lowered = sub.trim().toLowerCase();
  if (isTrackerCategory(lowered)) return lowered;
  const snake = lowered.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (isTrackerCategory(snake)) return snake;
  const byLabel = CATEGORY_BY_LABEL.get(lowered);
  if (byLabel) return byLabel;
  for (const [pattern, value] of CATEGORY_KEYWORDS) if (pattern.test(lowered)) return value;
  return undefined;
}

/**
 * Siasa (subcategory, category) → initiatives.category. Always returns a value
 * from the check list. In order: the subcategory names a Tracker value or
 * label; a §4 keyword matches; the current value is kept when it still fits
 * the Siasa bucket; else `infrastructure` / `other` by bucket.
 *
 * When the Siasa bucket changed on this save (infrastructure ↔
 * non-infrastructure) and the subcategory still belongs to the old bucket,
 * the bucket wins: keeping the subcategory would read back in the old bucket
 * and silently undo the change.
 */
export function resolveTrackerCategory(input: {
  subcategory?: string | null;
  category?: ProjectCategory | null;
  existing?: string | null;
}): TrackerCategory {
  const fromText = categoryFromText(input.subcategory ?? "");
  const oldBucket = isTrackerCategory(input.existing) ? categoryBucket(input.existing) : undefined;
  const bucketChanged = Boolean(input.category && oldBucket && input.category !== oldBucket);
  if (fromText) {
    if (bucketChanged && categoryBucket(fromText) === oldBucket) {
      return input.category === "infrastructure" ? "infrastructure" : "other";
    }
    return fromText;
  }
  const bucket = input.category ?? (input.existing ? categoryBucket(input.existing) : undefined);
  if (isTrackerCategory(input.existing) && (!bucket || categoryBucket(input.existing) === bucket)) {
    return input.existing;
  }
  return bucket === "infrastructure" ? "infrastructure" : "other";
}

// ---------------------------------------------------------------------------
// Statuses

export const INITIATIVE_STATUSES = ["draft", "published", "active", "completed", "stalled"] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];
export const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "delayed", "cancelled"] as const;
export type TrackerMilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface StatusFacts {
  /** Tracker statuses of the project's milestones. */
  milestoneStatuses: readonly string[];
  /** initiatives.start_date (NEW). Not the created_at fallback. */
  startDate?: string | null;
  /** YYYY-MM-DD */
  today: string;
}

/** §4 Tracker → Siasa. `draft` reads as planned (only its owner can see it). */
export function readProjectStatus(status: string | null | undefined, facts: StatusFacts): ProjectStatus {
  switch (status) {
    case "active":
      return "in-progress";
    case "completed":
      return "completed";
    case "stalled":
      return "on-hold";
    case "published": {
      const started = facts.milestoneStatuses.some((s) => s === "in_progress" || s === "completed");
      const due = Boolean(facts.startDate && facts.startDate.slice(0, 10) <= facts.today);
      return started || due ? "in-progress" : "planned";
    }
    default:
      return "planned";
  }
}

const PROJECT_STATUS_WRITE: Record<ProjectStatus, InitiativeStatus> = {
  planned: "published",
  "in-progress": "active",
  completed: "completed",
  "on-hold": "stalled",
};

/**
 * §4 Siasa → Tracker. When the stored value already reads as the incoming
 * Siasa status (a draft read as planned, a published row read as in-progress)
 * it is kept, so a save that does not change the status never publishes a
 * draft or rewrites the Tracker's own value.
 */
export function writeProjectStatus(
  next: ProjectStatus,
  existing?: { status: string; readsAs: ProjectStatus }
): InitiativeStatus {
  if (
    existing &&
    existing.readsAs === next &&
    (INITIATIVE_STATUSES as readonly string[]).includes(existing.status)
  ) {
    return existing.status as InitiativeStatus;
  }
  return PROJECT_STATUS_WRITE[next] ?? "published";
}

/** §5 Tracker → Siasa. `cancelled` is left out of the timeline (undefined). */
export function readMilestoneStatus(status: string | null | undefined): MilestoneStatus | undefined {
  switch (status) {
    case "completed":
      return "completed";
    case "in_progress":
    case "delayed":
      return "current";
    case "cancelled":
      return undefined;
    default:
      return "upcoming";
  }
}

const MILESTONE_STATUS_WRITE: Record<MilestoneStatus, TrackerMilestoneStatus> = {
  completed: "completed",
  current: "in_progress",
  upcoming: "pending",
};

/** §5 Siasa → Tracker. Keeps `delayed` when the milestone is still `current`. */
export function writeMilestoneStatus(next: MilestoneStatus, existing?: string | null): TrackerMilestoneStatus {
  if (existing && existing !== "cancelled" && readMilestoneStatus(existing) === next) {
    return existing as TrackerMilestoneStatus;
  }
  return MILESTONE_STATUS_WRITE[next] ?? "pending";
}

/** completed_at = now when completed (kept if it already was), cleared otherwise. */
export function milestoneCompletedAt(
  status: TrackerMilestoneStatus,
  existing: Pick<MilestoneRow, "status" | "completed_at"> | undefined,
  now: Date
): string | null {
  if (status !== "completed") return null;
  if (existing?.status === "completed" && existing.completed_at) return existing.completed_at;
  return now.toISOString();
}

// ---------------------------------------------------------------------------
// Dates

/** Normalises to YYYY-MM-DD, or undefined when the value is not a date. */
export function toDateOnly(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

export function todayDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Location / GIS

/** Tracker src/lib/projectLocation.ts */
export const KENYA_MAP_CENTER: LatLng = { lat: -0.0236, lng: 37.9062 };
export const NAIROBI_CBD: LatLng = { lat: -1.286389, lng: 36.817223 };

function nearlyEqual(a: number, b: number, epsilon = 0.00015) {
  return Math.abs(a - b) < epsilon;
}

/** Same test as the Tracker's isPlaceholderCoordinate / hasUsableProjectPin. */
export function isPlaceholderPin(point: LatLng | null | undefined): boolean {
  if (!point) return true;
  const { lat, lng } = point;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return true;
  if (nearlyEqual(lat, KENYA_MAP_CENTER.lat) && nearlyEqual(lng, KENYA_MAP_CENTER.lng)) return true;
  if (nearlyEqual(lat, NAIROBI_CBD.lat) && nearlyEqual(lng, NAIROBI_CBD.lng)) return true;
  return false;
}

export interface ParsedLocation {
  county?: string;
  constituency?: string;
  ward?: string;
  specificArea?: string;
  /** Any finite pin, placeholder or not. */
  coordinates?: LatLng;
  /** Only when ≥ 3 valid points. */
  geofence?: LatLng[];
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function point(value: unknown): LatLng | undefined {
  if (!isRecord(value)) return undefined;
  const lat = value.lat != null && value.lat !== "" ? Number(value.lat) : NaN;
  const lng = value.lng != null && value.lng !== "" ? Number(value.lng) : NaN;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

/**
 * Reads initiatives.location the way the Tracker's normalizeLocation does:
 * `coordinates` or legacy `coords` or top-level lat/lng; string numbers allowed;
 * `""` counts as missing.
 */
export function parseLocation(raw: unknown): ParsedLocation {
  if (!isRecord(raw)) return {};
  const coordinates = point(raw.coordinates) ?? point(raw.coords) ?? point(raw);
  const fence = Array.isArray(raw.geofence)
    ? raw.geofence.map(point).filter((p): p is LatLng => Boolean(p))
    : [];
  return {
    county: text(raw.county),
    constituency: text(raw.constituency),
    ward: text(raw.ward),
    specificArea: text(raw.specific_area),
    coordinates,
    geofence: fence.length >= 3 ? fence : undefined,
  };
}

/** specific_area values such as "601" or "-1.313, 36.789" are not place names. */
export function isJunkArea(value: string | undefined): boolean {
  if (!value) return true;
  return /^[\s\d.,;:+\-°NSEW()]+$/i.test(value) && /\d/.test(value);
}

function countyLabel(county: string): string {
  return /\bcounty$/i.test(county) ? county : `${county} County`;
}

/** §4 read: specific_area (unless junk), constituency, "<county> County". */
export function locationLabel(location: ParsedLocation): string {
  const parts: string[] = [];
  if (!isJunkArea(location.specificArea)) parts.push(location.specificArea as string);
  if (location.constituency) parts.push(location.constituency);
  if (location.county) parts.push(countyLabel(location.county));
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(", ");
}

/**
 * The Siasa location string back to specific_area: drops the parts that are
 * the constituency or county, which locationLabel appended on read.
 */
export function specificAreaFromLabel(
  label: string,
  location: { county?: string; constituency?: string }
): string {
  const drop = new Set<string>();
  if (location.county) {
    drop.add(location.county.toLowerCase());
    drop.add(countyLabel(location.county).toLowerCase());
  }
  if (location.constituency) drop.add(location.constituency.toLowerCase());
  return label
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !drop.has(part.toLowerCase()))
    .join(", ");
}

/** Tracker geofence [{lat,lng}] → GeoJSON Polygon ([lng, lat], closed ring). */
export function geofenceToBoundary(points: LatLng[] | undefined): GeoBounds | undefined {
  if (!points || points.length < 3) return undefined;
  const ring = points.map((p) => [p.lng, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return { type: "Polygon", coordinates: [ring] };
}

/** GeoJSON Polygon → Tracker geofence. Drops the closing point; undefined below 3 points. */
export function boundaryToGeofence(boundary: GeoBounds | undefined | null): LatLng[] | undefined {
  const ring = boundary?.coordinates?.[0];
  if (!Array.isArray(ring)) return undefined;
  const points = ring
    .filter((pair) => Array.isArray(pair) && pair.length >= 2)
    .map((pair) => ({ lat: Number(pair[1]), lng: Number(pair[0]) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) points.pop();
  }
  return points.length >= 3 ? points : undefined;
}

/**
 * Siasa geo for a row. A missing or placeholder pin gives no `center` (§4, §15):
 * Project.geo.center is typed as required, so callers must treat it as optional
 * until src/types makes it so.
 */
export function projectGeo(location: ParsedLocation): Project["geo"] {
  const center = location.coordinates && !isPlaceholderPin(location.coordinates)
    ? { lat: location.coordinates.lat, lng: location.coordinates.lng }
    : undefined;
  const boundary = geofenceToBoundary(location.geofence);
  const geo: { center?: GeoPoint; boundary?: GeoBounds } = {};
  if (center) geo.center = center;
  if (boundary) geo.boundary = boundary;
  return geo as Project["geo"];
}

export const PIN_REQUIRED_MESSAGE =
  "Drop a pin on the map. The default Kenya view cannot be used as the project location.";

/**
 * Read-modify-write of initiatives.location. Every key the Tracker stored
 * (constituency, ward, legacy keys) is kept; only county, specific_area,
 * coordinates and geofence change.
 */
export function buildLocation(
  existingRaw: unknown,
  input: { label: string; county: string; center?: GeoPoint | null; boundary?: GeoBounds | null }
): Json {
  const creating = !isRecord(existingRaw);
  const base: Json = creating ? {} : { ...(existingRaw as Json) };
  const current = parseLocation(existingRaw);
  const county = (input.county ?? "").trim();
  // An unchanged county keeps its stored form (no spurious write on a round trip).
  if (creating || county !== (current.county ?? "")) base.county = county;
  // The Tracker create shape has constituency and specific_area keys; an
  // existing row that lacks them is not padded (that would be a no-op write).
  if (creating && !("constituency" in base)) base.constituency = "";

  const label = (input.label ?? "").trim();
  if (label !== locationLabel(current)) {
    base.specific_area = specificAreaFromLabel(label, { county, constituency: current.constituency });
  } else if (creating && !("specific_area" in base)) {
    base.specific_area = "";
  }

  const center = input.center ? { lat: Number(input.center.lat), lng: Number(input.center.lng) } : undefined;
  if (center && !isPlaceholderPin(center)) {
    base.coordinates = center;
  } else if (!current.coordinates) {
    throw new ProjectInputError(PIN_REQUIRED_MESSAGE);
  }

  if (input.boundary) {
    const fence = boundaryToGeofence(input.boundary);
    if (!fence) throw new ProjectInputError("A project boundary needs at least 3 points.");
    base.geofence = fence;
  } else {
    delete base.geofence;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Media and satellite snapshots

/** Tracker MAX_PROJECT_IMAGES */
export const MAX_PROJECT_IMAGES = 5;

export interface SatelliteSnapshot {
  date: string;
  imageUrl: string;
  cloudCoverage?: number;
  bounds?: { north: number; south: number; east: number; west: number };
  captured_at?: string;
  ai_analysis?: { status?: string; changePercentage?: number; notes?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Same filter as the Tracker's parseSatelliteSnapshots: entries with a non-empty imageUrl. */
export function parseSatelliteSnapshots(raw: unknown): SatelliteSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is SatelliteSnapshot =>
      isRecord(item) && typeof item.imageUrl === "string" && item.imageUrl.length > 0
  );
}

function cleanImages(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((url): url is string => typeof url === "string" && url.trim().length > 0).map((u) => u.trim())
    : [];
}

/** Hero image like the Tracker's resolveProjectMedia: first photo, else first satellite frame. */
export function projectImage(row: Pick<InitiativeRow, "reference_images" | "satellite_snapshots">): string {
  return cleanImages(row.reference_images)[0] ?? parseSatelliteSnapshots(row.satellite_snapshots)[0]?.imageUrl ?? "";
}

/** §4: put the Siasa image first and keep the other Tracker photos (max 5). Empty image keeps the list. */
export function mergeReferenceImages(existing: unknown, image: string | undefined): string[] {
  const photos = cleanImages(existing);
  const first = (image ?? "").trim();
  if (!first) return photos;
  return [first, ...photos.filter((url) => url !== first)].slice(0, MAX_PROJECT_IMAGES);
}

// ---------------------------------------------------------------------------
// Progress

/** Visible (not cancelled) milestones, completed share in percent. */
export function progressFromMilestones(statuses: readonly string[]): number {
  const counted = statuses.filter((s) => s !== "cancelled");
  if (counted.length === 0) return 0;
  return Math.round((100 * counted.filter((s) => s === "completed").length) / counted.length);
}

export function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Project

/** Everything about a project that lives in other tables. */
export interface ProjectLinks {
  leaderIds: string[];
  /** All milestone rows of the project (cancelled included), any order. */
  milestones: Pick<MilestoneRow, "id" | "status" | "target_date" | "created_at">[];
  opportunityIds: string[];
  mediaIds: string[];
  hasPublishedOpportunity: boolean;
  /**
   * Auth user id of the project's owner (changemakers.user_id), when the
   * reader can see it. Carried on the Project as `ownerUserId` so the Adly
   * studio offers a user only the projects they own (not commissioned ones).
   */
  ownerUserId?: string | null;
  /** changemakers.name of the owner, when readable. Shown as "Led by" when there is no leader profile. */
  ownerName?: string | null;
}

export const EMPTY_LINKS: ProjectLinks = {
  leaderIds: [],
  milestones: [],
  opportunityIds: [],
  mediaIds: [],
  hasPublishedOpportunity: false,
};

/** Timeline order: target_date, then created_at; cancelled rows left out. */
export function orderMilestones<T extends Pick<MilestoneRow, "status" | "target_date" | "created_at">>(
  rows: readonly T[]
): T[] {
  return rows
    .filter((row) => row.status !== "cancelled")
    .slice()
    .sort(
      (a, b) =>
        (a.target_date ?? "").localeCompare(b.target_date ?? "") ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "")
    );
}

export function readProjectStatusOf(row: InitiativeRow, links: ProjectLinks, today: string): ProjectStatus {
  return readProjectStatus(row.status, {
    milestoneStatuses: links.milestones.map((m) => m.status),
    startDate: row.start_date ?? null,
    today,
  });
}

export function mapInitiative(
  row: InitiativeRow,
  links: ProjectLinks,
  options: { slug: string; today: string }
): Project {
  const location = parseLocation(row.location);
  const statuses = links.milestones.map((m) => m.status);
  const progress =
    row.progress_percent != null ? clampPercent(row.progress_percent) : progressFromMilestones(statuses);
  return {
    id: row.id,
    slug: options.slug,
    name: row.title ?? "",
    category: categoryBucket(row.category),
    subcategory: row.category ?? "other",
    location: locationLabel(location),
    county: location.county ?? "",
    status: readProjectStatusOf(row, links, options.today),
    progress,
    image: projectImage(row),
    description: row.description ?? row.short_description ?? "",
    startDate: toDateOnly(row.start_date) ?? toDateOnly(row.created_at) ?? "",
    expectedCompletion: toDateOnly(row.expected_completion) ?? "",
    leaderIds: [...links.leaderIds],
    geo: projectGeo(location),
    milestoneIds: orderMilestones(links.milestones).map((m) => m.id),
    opportunityIds: [...links.opportunityIds],
    mediaIds: [...links.mediaIds],
    requiresOpportunities: links.hasPublishedOpportunity,
    ...(links.ownerName ? { creatorName: links.ownerName } : {}),
  };
}

/** Insert payload. NEW columns are included; the repository drops them if the column is missing. */
export function buildInitiativeInsert(
  project: Project,
  options: { changemakerId: string }
): Json {
  const name = (project.name ?? "").trim();
  if (!name) throw new ProjectInputError("Project name is required.");
  const description = (project.description ?? "").trim();
  if (!description) throw new ProjectInputError("Project description is required.");
  const location = buildLocation(undefined, {
    label: project.location ?? "",
    county: project.county ?? "",
    center: project.geo?.center,
    boundary: project.geo?.boundary,
  });
  const payload: Json = {
    changemaker_id: options.changemakerId,
    title: name,
    description,
    short_description: description.slice(0, 240),
    category: resolveTrackerCategory({ subcategory: project.subcategory, category: project.category }),
    target_amount: 0,
    location,
    status: writeProjectStatus(project.status),
    expected_completion: toDateOnly(project.expectedCompletion) ?? null,
    reference_images: mergeReferenceImages([], project.image),
  };
  const start = toDateOnly(project.startDate);
  if (start) payload.start_date = start;
  // 0 stays null so progress keeps deriving from milestones.
  if (clampPercent(project.progress) > 0) payload.progress_percent = clampPercent(project.progress);
  return payload;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Update patch: only columns whose value changes. Tracker-only columns
 * (target_amount, raised_amount, payment_details, satellite_snapshots,
 * project_duration, opportunity_preferences) are never in it. NEW columns are
 * written only when the existing row has them (the migration has shipped).
 */
export function buildInitiativeUpdate(
  existing: InitiativeRow,
  project: Project,
  options: { links: ProjectLinks; today: string }
): Json {
  const patch: Json = {};
  const set = (column: string, value: unknown) => {
    if (stable((existing as unknown as Json)[column]) !== stable(value)) patch[column] = value;
  };

  const name = (project.name ?? "").trim();
  if (!name) throw new ProjectInputError("Project name is required.");
  set("title", name);

  const description = (project.description ?? "").trim();
  if (!description) throw new ProjectInputError("Project description is required.");
  if (description !== existing.description) {
    patch.description = description;
    set("short_description", description.slice(0, 240));
  }

  set(
    "category",
    resolveTrackerCategory({
      subcategory: project.subcategory,
      category: project.category,
      existing: existing.category,
    })
  );

  set(
    "status",
    writeProjectStatus(project.status, {
      status: existing.status,
      readsAs: readProjectStatusOf(existing, options.links, options.today),
    })
  );

  set("expected_completion", toDateOnly(project.expectedCompletion) ?? null);
  // projectImage() falls back to the first satellite frame. Sending that back
  // must not copy it into reference_images, so only a changed image is merged,
  // and a satellite frame never is.
  const image = (project.image ?? "").trim();
  const satellite = parseSatelliteSnapshots(existing.satellite_snapshots).map((s) => s.imageUrl.trim());
  if (image && image !== projectImage(existing) && !satellite.includes(image)) {
    set("reference_images", mergeReferenceImages(existing.reference_images, image));
  }
  set(
    "location",
    buildLocation(existing.location, {
      label: project.location ?? "",
      county: project.county ?? "",
      center: project.geo?.center,
      boundary: project.geo?.boundary,
    })
  );

  if ("start_date" in existing) {
    const start = toDateOnly(project.startDate) ?? null;
    // The read fallback is created_at; sending it back must not invent a start date.
    const fallback = existing.start_date == null && start === toDateOnly(existing.created_at);
    if (!fallback) set("start_date", start);
  }
  if ("progress_percent" in existing) {
    const progress = clampPercent(project.progress);
    const derived = progressFromMilestones(options.links.milestones.map((m) => m.status));
    // Equal to the milestone-derived value while unset: keep deriving.
    if (!(existing.progress_percent == null && progress === derived)) set("progress_percent", progress);
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Milestones

/** 1-based timeline numbers per project (cancelled rows have none). */
export function milestoneNumbers(
  rows: readonly Pick<MilestoneRow, "id" | "initiative_id" | "status" | "target_date" | "created_at">[]
): Map<string, number> {
  const byProject = new Map<string, typeof rows[number][]>();
  for (const row of rows) {
    const list = byProject.get(row.initiative_id) ?? [];
    list.push(row);
    byProject.set(row.initiative_id, list);
  }
  const numbers = new Map<string, number>();
  for (const list of byProject.values()) {
    orderMilestones(list).forEach((row, index) => numbers.set(row.id, index + 1));
  }
  return numbers;
}

/** undefined for cancelled milestones, which Siasa does not show. */
export function mapMilestone(row: MilestoneRow, number: number): ProjectMilestone | undefined {
  const status = readMilestoneStatus(row.status);
  if (!status) return undefined;
  const milestone: ProjectMilestone = {
    id: row.id,
    projectId: row.initiative_id,
    number,
    date: toDateOnly(row.target_date) ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    status,
  };
  if (row.image_url) milestone.image = row.image_url;
  return milestone;
}

function milestoneDate(item: ProjectMilestone): string {
  const date = toDateOnly(item.date);
  if (!date) throw new ProjectInputError("Pick a target date for the milestone.");
  return date;
}

export function buildMilestoneInsert(item: ProjectMilestone, now: Date): Json {
  const title = (item.title ?? "").trim();
  if (!title) throw new ProjectInputError("Milestone title is required.");
  const status = writeMilestoneStatus(item.status);
  const payload: Json = {
    initiative_id: item.projectId,
    title,
    target_date: milestoneDate(item),
    description: (item.description ?? "").trim() || null,
    status,
    completed_at: milestoneCompletedAt(status, undefined, now),
  };
  if (item.image) payload.image_url = item.image;
  return payload;
}

export function buildMilestoneUpdate(existing: MilestoneRow, item: ProjectMilestone, now: Date): Json {
  const patch: Json = {};
  const set = (column: string, value: unknown) => {
    if (stable((existing as unknown as Json)[column]) !== stable(value)) patch[column] = value;
  };
  const title = (item.title ?? "").trim();
  if (!title) throw new ProjectInputError("Milestone title is required.");
  set("initiative_id", item.projectId);
  set("title", title);
  set("target_date", milestoneDate(item));
  set("description", (item.description ?? "").trim() || null);
  const status = writeMilestoneStatus(item.status, existing.status);
  set("status", status);
  set("completed_at", milestoneCompletedAt(status, existing, now));
  if ("image_url" in existing) set("image_url", item.image?.trim() || null);
  return patch;
}

/** Drops the §17 NEW columns from a payload (for retrying against the pre-migration schema). */
export function withoutColumns(payload: Json, columns: readonly string[]): Json {
  const copy = { ...payload };
  for (const column of columns) delete copy[column];
  return copy;
}
