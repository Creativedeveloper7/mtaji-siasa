import { rowSlug } from "@/server/tracker/slug";
import type { Leader, LeaderType, ProjectCategory, ProposedProject, SocialLinks, Vision } from "@/types";

/**
 * Leader <-> political_figures mapping (docs/content-mapping.md §3).
 *
 * Pure functions only: no Supabase client here, so the rules can be tested on
 * plain rows. Every column that does not exist on the live table yet (§17 M3,
 * M5) is listed in NEW_FIGURE_COLUMNS, so the write path can drop them until
 * the migrations ship.
 */

/** political_figures_position_check, live 2026-10-22. Never write anything else. */
export const FIGURE_POSITIONS = [
  "president",
  "deputy_president",
  "governor",
  "deputy_governor",
  "senator",
  "mp",
  "woman_representative",
  "mca",
] as const;
export type FigurePosition = (typeof FIGURE_POSITIONS)[number];

/** political_figures_status_check, live 2026-10-22. */
export const FIGURE_STATUSES = ["active", "inactive", "seeking_reelection", "aspirant", "former"] as const;
export type FigureStatus = (typeof FIGURE_STATUSES)[number];

/** Columns proposed in §17 (M3 profile fields, M5 vision). Not on the live table yet. */
export const NEW_FIGURE_COLUMNS = [
  "honorific",
  "office_title",
  "profile_image_url",
  "cover_image_url",
  "short_bio",
  "bio",
  "achievements",
  "social_links",
  "vision",
] as const;

const SOCIAL_KEYS = ["x", "instagram", "facebook", "tiktok", "whatsapp", "website"] as const;

/** The manifesto jsonb. Unknown keys (party, focus_areas, targets, summary…) are kept on write. */
export type FigureManifesto = Record<string, unknown> & {
  text?: string;
  hero_title?: string;
  office_label?: string;
};

/** A political_figures row as Siasa reads it (`select *`). New columns are optional. */
export interface FigureRow {
  id: string;
  user_id: string | null;
  name: string;
  position: string;
  county: string | null;
  constituency: string | null;
  ward: string | null;
  term_start?: string;
  term_end?: string;
  term_years?: number;
  manifesto: FigureManifesto | null;
  commissioned_projects?: string[] | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
  /** M1 generated column. Base slug only, never collision-suffixed. */
  slug?: string | null;
  // §17 M3
  honorific?: string | null;
  office_title?: string | null;
  profile_image_url?: string | null;
  cover_image_url?: string | null;
  short_bio?: string | null;
  bio?: string | null;
  achievements?: string[] | null;
  social_links?: Record<string, unknown> | null;
  // §17 M5
  vision?: Record<string, unknown> | null;
}

/** Columns Siasa writes. user_id and id are set by the repository, not here. */
export type FigureWrite = Partial<Omit<FigureRow, "id" | "user_id" | "created_at" | "updated_at" | "slug" | "commissioned_projects">> & {
  id?: string;
  user_id?: string | null;
};

export interface LeaderLinks {
  projectIds: string[];
  opportunityIds: string[];
  mediaIds: string[];
  pollIds: string[];
  productIds: string[];
}

export const NO_LINKS: LeaderLinks = Object.freeze({
  projectIds: [],
  opportunityIds: [],
  mediaIds: [],
  pollIds: [],
  productIds: [],
}) as LeaderLinks;

// ---------------------------------------------------------------------------
// small helpers

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | undefined {
  return text(value) || undefined;
}

function nullableText(value: unknown): string | null {
  return text(value) || null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// position

/** Tracker politicianMapper.formatPosition: `woman_representative` -> `Woman Representative`. */
export function formatPosition(position: string | null | undefined): string {
  if (!position) return "Leader";
  return String(position)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** §3 table: first match wins, case-insensitive, on Siasa's free-text office. */
const OFFICE_PATTERNS: Array<[RegExp, FigurePosition]> = [
  [/deputy\s+president/i, "deputy_president"],
  [/president/i, "president"],
  [/deputy\s+governor/i, "deputy_governor"],
  [/governor/i, "governor"],
  [/senator/i, "senator"],
  [/wom(a|e)n\s+rep/i, "woman_representative"],
  [/\bmca\b|county\s+assembly|ward\s+rep/i, "mca"],
  [/\bmp\b|member\s+of\s+parliament|national\s+assembly/i, "mp"],
];

/** The CHECK value a free-text office implies, or undefined when nothing matches. */
export function positionFromOffice(office: string | null | undefined): FigurePosition | undefined {
  const value = text(office);
  if (!value) return undefined;
  for (const [pattern, position] of OFFICE_PATTERNS) {
    if (pattern.test(value)) return position;
  }
  return undefined;
}

export function isFigurePosition(value: unknown): value is FigurePosition {
  return typeof value === "string" && (FIGURE_POSITIONS as readonly string[]).includes(value);
}

export const OFFICE_REQUIRED_MESSAGE = "Name the office, e.g. MCA, MP, Governor";

// ---------------------------------------------------------------------------
// status / type

export function typeFromStatus(status: string | null | undefined): LeaderType {
  return status === "aspirant" ? "aspirant" : "elected";
}

/** `former` rows are hidden from public lists (§3). */
export function isPubliclyListed(status: string | null | undefined): boolean {
  return status !== "former";
}

/**
 * aspirant -> 'aspirant'. elected -> keep 'active' / 'seeking_reelection',
 * anything else (new row, 'aspirant', 'inactive', 'former') becomes 'active'.
 */
export function statusFromType(type: LeaderType, current?: string | null): FigureStatus {
  if (type === "aspirant") return "aspirant";
  if (current === "active" || current === "seeking_reelection") return current;
  return "active";
}

// ---------------------------------------------------------------------------
// manifesto / vision

/** Split manifesto text into paragraphs on blank lines; drop empty items. */
export function splitManifesto(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n[ \t]*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinManifesto(paragraphs: string[]): string {
  return paragraphs.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

const PROJECT_CATEGORIES: readonly ProjectCategory[] = ["infrastructure", "non-infrastructure"];

function proposedProjects(value: unknown): ProposedProject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const title = text(item.title);
    if (!title) return [];
    return [
      {
        id: text(item.id) || `proposed-${index + 1}`,
        title,
        description: text(item.description),
        location: text(item.location),
        category: PROJECT_CATEGORIES.includes(item.category as ProjectCategory)
          ? (item.category as ProjectCategory)
          : "infrastructure",
        simulationImage: text(item.simulationImage),
        expectedImpact: text(item.expectedImpact),
      },
    ];
  });
}

function readVision(row: FigureRow): Vision | undefined {
  const manifesto = isRecord(row.manifesto) ? row.manifesto : {};
  const extra = isRecord(row.vision) ? row.vision : undefined;
  const vision: Vision = {
    statement: text(manifesto.hero_title),
    manifesto: splitManifesto(manifesto.text),
    priorities: textList(extra?.priorities),
    proposedProjects: proposedProjects(extra?.proposedProjects),
    expectedImpact: textList(extra?.expectedImpact),
  };
  const empty =
    !vision.statement &&
    !vision.manifesto.length &&
    !vision.priorities.length &&
    !vision.proposedProjects.length &&
    !vision.expectedImpact.length;
  // An empty vision reads as "no vision", the same as the memory adapter's undefined.
  return empty && !extra ? undefined : vision;
}

/**
 * Read-modify-write of the manifesto jsonb: only `hero_title` and `text` are
 * Siasa's. Every other key (party, focus_areas, targets, summary, uploaded_at…)
 * is kept. Unchanged paragraphs keep the stored text byte for byte.
 */
export function writeManifesto(
  vision: Vision,
  existing: FigureManifesto | null | undefined,
  now: Date
): FigureManifesto {
  const base: FigureManifesto = isRecord(existing)
    ? { ...existing }
    : { text: "", focus_areas: [], targets: [], uploaded_at: now.toISOString() };
  const statement = text(vision.statement);
  if (statement) base.hero_title = statement;
  else delete base.hero_title;
  if (!sameList(splitManifesto(base.text), textList(vision.manifesto))) {
    base.text = joinManifesto(vision.manifesto);
  }
  if (typeof base.text !== "string") base.text = "";
  return base;
}

function writeVision(vision: Vision, existing: Record<string, unknown> | null | undefined) {
  return {
    ...(isRecord(existing) ? existing : {}),
    priorities: textList(vision.priorities),
    proposedProjects: (vision.proposedProjects ?? []).map((item) => ({
      id: item.id,
      title: text(item.title),
      description: text(item.description),
      location: text(item.location),
      category: item.category,
      simulationImage: text(item.simulationImage),
      expectedImpact: text(item.expectedImpact),
    })),
    expectedImpact: textList(vision.expectedImpact),
  };
}

// ---------------------------------------------------------------------------
// social

function readSocial(value: unknown): SocialLinks {
  const social: SocialLinks = {};
  if (!isRecord(value)) return social;
  for (const key of SOCIAL_KEYS) {
    const link = text(value[key]);
    if (link) social[key] = link;
  }
  return social;
}

/** Siasa owns the six keys; anything else already in social_links is kept. */
function writeSocial(social: SocialLinks | undefined, existing: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
  for (const key of SOCIAL_KEYS) {
    const link = text(social?.[key]);
    if (link) next[key] = link;
    else delete next[key];
  }
  return next;
}

// ---------------------------------------------------------------------------
// row -> Leader

export interface RowToLeaderOptions {
  /** Route slug from assignSlugs (collision-aware). Defaults to the row's base slug (§2). */
  slug?: string;
  links?: LeaderLinks;
  /** profiles.bio of row.user_id; used when the figure has no bio of its own. */
  profileBio?: string | null;
}

export function rowToLeader(row: FigureRow, options: RowToLeaderOptions = {}): Leader {
  const manifesto = isRecord(row.manifesto) ? row.manifesto : {};
  const links = options.links ?? NO_LINKS;
  const leader: Leader = {
    id: row.id,
    slug: options.slug || rowSlug(row.name, row.id),
    name: row.name ?? "",
    honorific: text(row.honorific),
    position:
      text(row.office_title) || text(manifesto.office_label) || formatPosition(row.position),
    type: typeFromStatus(row.status),
    county: text(row.county),
    constituency: optionalText(row.constituency),
    ward: optionalText(row.ward),
    // Never a stock photo: an empty string means "no upload yet".
    photo: text(row.profile_image_url),
    coverImage: optionalText(row.cover_image_url),
    shortBio: text(row.short_bio),
    bio: text(row.bio) || text(options.profileBio),
    achievements: textList(row.achievements),
    social: readSocial(row.social_links),
    projectIds: [...links.projectIds],
    opportunityIds: [...links.opportunityIds],
    mediaIds: [...links.mediaIds],
    pollIds: [...links.pollIds],
    productIds: [...links.productIds],
  };
  const vision = readVision(row);
  if (vision) leader.vision = vision;
  return leader;
}

// ---------------------------------------------------------------------------
// Leader -> row

export type LeaderToRowResult = { ok: true; row: FigureWrite } | { ok: false; error: string };

export interface LeaderToRowOptions {
  now?: Date;
  /** False drops NEW_FIGURE_COLUMNS from the write, for a database without §17 M3/M5. */
  newColumns?: boolean;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Columns to write for `leader`. `existing` is the stored row on update and
 * undefined on create. Link arrays and slug are derived elsewhere and never
 * written. id / user_id are the repository's business.
 */
export function leaderToRow(
  leader: Leader,
  existing?: FigureRow | null,
  options: LeaderToRowOptions = {}
): LeaderToRowResult {
  const now = options.now ?? new Date();
  const name = text(leader.name);
  if (!name) return { ok: false, error: "Leader name is required." };

  const officeTitle = text(leader.position);
  const derived = positionFromOffice(officeTitle);
  let position: FigurePosition;
  if (derived) position = derived;
  else if (existing && isFigurePosition(existing.position)) position = existing.position;
  else return { ok: false, error: OFFICE_REQUIRED_MESSAGE };

  const row: FigureWrite = {
    name,
    position,
    status: statusFromType(leader.type, existing?.status),
    county: nullableText(leader.county),
    constituency: nullableText(leader.constituency),
    ward: nullableText(leader.ward),
    // §17 M3
    honorific: nullableText(leader.honorific),
    office_title: officeTitle || null,
    profile_image_url: nullableText(leader.photo),
    cover_image_url: nullableText(leader.coverImage),
    short_bio: nullableText(leader.shortBio),
    bio: nullableText(leader.bio),
    achievements: textList(leader.achievements),
    social_links: writeSocial(leader.social, existing?.social_links),
  };

  if (leader.vision) {
    row.manifesto = writeManifesto(leader.vision, existing?.manifesto, now);
    row.vision = writeVision(leader.vision, existing?.vision); // §17 M5
  } else if (!existing) {
    row.manifesto = { text: "", focus_areas: [], targets: [], uploaded_at: now.toISOString() };
  }

  if (!existing) {
    // NOT NULL on the live table and not asked by Siasa. Same default as the
    // Tracker's own signupService: today .. today + 5 years. Never touched on update.
    const end = new Date(now);
    end.setUTCFullYear(end.getUTCFullYear() + 5);
    row.term_start = isoDate(now);
    row.term_end = isoDate(end);
    row.term_years = 5;
  }

  if (options.newColumns === false) {
    for (const column of NEW_FIGURE_COLUMNS) delete row[column];
  }
  return { ok: true, row };
}

/** True when writing `patch` would leave `existing` unchanged (null and undefined count as equal). */
export function isNoopWrite(patch: FigureWrite, existing: FigureRow): boolean {
  return Object.entries(patch).every(([key, value]) =>
    deepEqual(value ?? null, (existing as unknown as Record<string, unknown>)[key] ?? null)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => deepEqual(a[key] ?? null, b[key] ?? null));
  }
  return false;
}
