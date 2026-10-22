import type {
  ApplicationStatus,
  Opportunity,
  OpportunityApplication,
  OpportunityCategory,
  OpportunityStatus,
} from "@/types";
import type { AdlyInterestLead } from "@/server/domain";

/**
 * Pure mappers between Siasa's opportunity model and the Tracker tables
 * `opportunities`, `opportunity_applications`, `saved_opportunities` and
 * `contact_submissions`. See docs/content-mapping.md §6, §7, §13 and §14.
 *
 * Columns marked NEW in the doc (migrations M5b, M6, M8) may not exist yet.
 * Reads use `select("*")` and treat them as optional. Writes keep them in a
 * separate `extra` patch so the repository can retry without them.
 */

// ---------------------------------------------------------------------------
// Row shapes (live schema 2026-10-22, plus the NEW columns as optional)
// ---------------------------------------------------------------------------

export type OpportunityKind = "grant" | "call";
export type ListingStatus = "published" | "closed";
export type TrackerApplicationStatus = "pending" | "reviewed" | "shortlisted" | "accepted" | "rejected";

export const LISTING_STATUSES: readonly ListingStatus[] = ["published", "closed"];
/** The live CHECK list. `shortlisted` is only valid after M6. */
export const LIVE_APPLICATION_STATUSES: readonly TrackerApplicationStatus[] = [
  "pending",
  "reviewed",
  "accepted",
  "rejected",
];

export interface OpportunityRow {
  id: string;
  author_id: string | null;
  initiative_id: string | null;
  kind: string;
  title: string | null;
  organization: string | null;
  category: string | null;
  description: string | null;
  eligibility: string | null;
  how_to_apply: string | null;
  apply_url: string | null;
  amount: string | null;
  deadline: string | null;
  location: string | null;
  slots: string | null;
  listing_status: string;
  created_at: string;
  updated_at?: string | null;
  /** NEW (M5b) */
  county?: string | null;
  /** NEW (M5b) */
  image_url?: string | null;
  /** NEW (M5b) */
  benefits?: string[] | null;
  /** NEW (M5b) */
  requirements?: string[] | null;
  /** NEW (M1), generated. Not relied on: route slugs need collision handling. */
  slug?: string | null;
}

/** Linked initiative fields used as read fallbacks. */
export interface InitiativeLink {
  id: string;
  location: unknown;
  reference_images: string[] | null;
}

export interface ApplicationRow {
  id: string;
  opportunity_id: string;
  applicant_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: string;
  created_at: string;
  /** NEW (M6) */
  county?: string | null;
  /** NEW (M6) */
  attachment_url?: string | null;
  /** NEW (M6) */
  review_note?: string | null;
  /** NEW (M6) */
  updated_at?: string | null;
}

export interface ContactSubmissionRow {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((item): item is string => Boolean(item));
}

/** Same rule as the Tracker's isHttpUrl (src/lib/opportunityModel.ts). */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const DAY_MS = 86_400_000;

/** Today's date (yyyy-mm-dd) in Kenya, where every listing's deadline lives. */
export function nairobiToday(now: Date = new Date()): string {
  // Africa/Nairobi is UTC+3 all year (no daylight saving).
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** yyyy-mm-dd from a date or timestamp string, or null. */
export function toDateOnly(value: string | null | undefined): string | null {
  const trimmed = text(value);
  if (!trimmed) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (match && !Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) return match[1];
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Category  <->  kind + category  (§6)
// ---------------------------------------------------------------------------

const CALL_CATEGORY_READ: Record<string, OpportunityCategory> = {
  job: "jobs",
  internship: "jobs",
  tender: "tenders",
  training: "training",
  fellowship: "training",
  youth: "youth",
  "project ambassadorship": "youth",
  "content creation": "youth",
  volunteering: "youth",
  business: "business",
};

const CALL_CATEGORY_WRITE: Partial<Record<OpportunityCategory, string>> = {
  jobs: "Job",
  tenders: "Tender",
  training: "Training",
  youth: "Youth",
  business: "Business",
};

/** Tracker kind + free-text category → Siasa category. */
export function categoryFromTracker(kind: string | null | undefined, category: string | null | undefined): OpportunityCategory {
  if (kind === "grant") return "funding";
  const key = text(category)?.toLowerCase();
  return (key && CALL_CATEGORY_READ[key]) || "other";
}

/**
 * Siasa category → Tracker kind + category. When the existing row's category
 * already reads back as the same Siasa category, it is kept, so a Tracker
 * "Internship" or a grant's "Education" survives an edit made in Siasa.
 */
export function categoryToTracker(
  category: OpportunityCategory,
  existing?: Pick<OpportunityRow, "kind" | "category"> | null
): { kind: OpportunityKind; category: string | null } {
  const kind: OpportunityKind = category === "funding" ? "grant" : "call";
  if (existing && existing.kind === kind && categoryFromTracker(existing.kind, existing.category) === category) {
    return { kind, category: text(existing.category) ?? null };
  }
  if (kind === "grant") return { kind, category: null };
  return { kind, category: CALL_CATEGORY_WRITE[category] ?? null };
}

// ---------------------------------------------------------------------------
// Status  <->  listing_status + deadline  (§6)
// ---------------------------------------------------------------------------

/**
 * closed listing or deadline before today → closed; deadline within 7 days →
 * closing-soon; otherwise (including no deadline, "Rolling") → open.
 */
export function opportunityStatusFromTracker(
  listingStatus: string | null | undefined,
  deadline: string | null | undefined,
  now: Date = new Date()
): OpportunityStatus {
  if (listingStatus === "closed") return "closed";
  const day = toDateOnly(deadline);
  if (!day) return "open";
  const today = nairobiToday(now);
  if (day < today) return "closed";
  if (day <= addDays(today, 7)) return "closing-soon";
  return "open";
}

/**
 * Doc rule: closed → `closed`, anything else → `published`. Refinement: a
 * Siasa status of `closed` is often only what a read DERIVED from the stored
 * row (listing_status `published` whose stored deadline has passed), echoed
 * back by the editor. That echo must not close the row, or extending the
 * deadline of an expired listing would hide it. So the decision is based on
 * the STORED row:
 *
 * - stored row is `closed` → `closed` stays.
 * - stored row is `published` and its stored deadline has passed → the
 *   incoming `closed` is the derived value → `published` is kept (with a new
 *   future deadline the listing reopens). An author who really wants to close
 *   an already-expired listing gets the same result on the site: it reads as
 *   closed until the deadline moves.
 * - stored row is `published` with a current deadline → `closed` (an explicit close).
 * - new row: `closed` with a past deadline is the expired echo → `published`;
 *   otherwise `closed`.
 */
export function listingStatusToTracker(
  status: OpportunityStatus | undefined,
  deadline: string | null,
  existing?: Pick<OpportunityRow, "listing_status" | "deadline"> | null,
  now: Date = new Date()
): ListingStatus {
  if (status !== "closed") return "published";
  const today = nairobiToday(now);
  if (existing) {
    if (existing.listing_status === "closed") return "closed";
    const storedDeadline = toDateOnly(existing.deadline);
    if (storedDeadline && storedDeadline < today) return "published";
    return "closed";
  }
  if (deadline && deadline < today) return "published";
  return "closed";
}

// ---------------------------------------------------------------------------
// how_to_apply  <->  applicationSteps
// ---------------------------------------------------------------------------

export function stepsFromTracker(howToApply: string | null | undefined): string[] {
  return (howToApply ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
    .filter(Boolean);
}

export function stepsToTracker(steps: string[] | undefined): string | null {
  const lines = (steps ?? []).map((step) => step.trim()).filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// County fallback
// ---------------------------------------------------------------------------

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** county column → linked initiative's location.county → last comma part of location. */
export function countyFromTracker(row: Pick<OpportunityRow, "county" | "location">, initiative?: InitiativeLink): string {
  const own = text(row.county);
  if (own) return own;
  const location = initiative?.location;
  if (location && typeof location === "object" && !Array.isArray(location)) {
    const county = text((location as Record<string, unknown>).county);
    if (county) return county;
  }
  const parts = (row.location ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return "";
  const bare = last.replace(/\s+county$/i, "").trim();
  return bare ? titleCase(bare) : "";
}

// ---------------------------------------------------------------------------
// Opportunity
// ---------------------------------------------------------------------------

export interface OpportunityReadContext {
  /** Route slug for this row (from assignSlugs over every visible row). */
  slug: string;
  initiative?: InitiativeLink;
  /** political_figures.id of the author, when the author has one. */
  leaderId?: string;
  /** Published blogs linked to the same initiative. */
  relatedMediaIds?: string[];
  now?: Date;
}

export function opportunityFromRow(row: OpportunityRow, context: OpportunityReadContext): Opportunity {
  const benefits = textList(row.benefits);
  const amount = text(row.amount);
  const image = text(row.image_url) ?? text(context.initiative?.reference_images?.[0]);
  const steps = stepsFromTracker(row.how_to_apply);
  const deadline = toDateOnly(row.deadline);
  return {
    id: row.id,
    slug: context.slug,
    title: text(row.title) ?? "Untitled",
    category: categoryFromTracker(row.kind, row.category),
    location: text(row.location) ?? "",
    county: countyFromTracker(row, context.initiative),
    // The Tracker allows no deadline. "" lets the UI show "Rolling".
    deadline: deadline ?? "",
    eligibility: text(row.eligibility) ?? "",
    description: text(row.description) ?? "",
    image,
    projectId: row.initiative_id ?? undefined,
    leaderId: context.leaderId,
    status: opportunityStatusFromTracker(row.listing_status, row.deadline, context.now),
    openingDate: toDateOnly(row.created_at) ?? undefined,
    benefits: benefits.length ? benefits : amount ? [amount] : [],
    requirements: textList(row.requirements),
    applicationSteps: steps.length ? steps : undefined,
    organization: text(row.organization),
    // The stored value is kept as-is so an unrelated edit writes it back
    // unchanged. Pages sanitise it with safeHttpUrl before linking to it.
    applicationUrl: text(row.apply_url),
    relatedMediaIds: context.relatedMediaIds?.length ? context.relatedMediaIds : undefined,
  };
}

export class OpportunityValidationError extends Error {}

/** Columns that exist live (base) and columns added by M5b (extra). */
export interface OpportunityWrite {
  base: {
    title: string;
    kind: OpportunityKind;
    category: string | null;
    organization: string | null;
    description: string | null;
    eligibility: string | null;
    how_to_apply: string | null;
    apply_url: string | null;
    deadline: string | null;
    location: string | null;
    initiative_id: string | null;
    listing_status: ListingStatus;
  };
  extra: {
    county: string | null;
    image_url: string | null;
    benefits: string[];
    requirements: string[];
  };
}

/**
 * Siasa opportunity → column values. `author_id` is not set here: inserts use
 * auth.uid() and updates never change it. `slots` and `amount` are
 * Tracker-only and are left out so an update keeps them.
 */
export function opportunityToRow(
  item: Opportunity,
  existing?: OpportunityRow | null,
  now: Date = new Date()
): OpportunityWrite {
  const title = text(item.title);
  if (!title) throw new OpportunityValidationError("Opportunity title is required.");
  const applyUrl = text(item.applicationUrl);
  // A stored link that is not http(s) (older Tracker rows) is written back
  // unchanged; only a new or changed link must be http(s).
  if (applyUrl && applyUrl !== text(existing?.apply_url) && !isHttpUrl(applyUrl)) {
    throw new OpportunityValidationError("The application link must start with http:// or https://.");
  }
  const deadline = toDateOnly(item.deadline);
  const { kind, category } = categoryToTracker(item.category, existing);
  let benefits = textList(item.benefits);
  // A read shows `amount` as the only benefit when benefits is empty. Do not
  // copy it into benefits on save.
  const amount = text(existing?.amount);
  if (amount && benefits.length === 1 && benefits[0] === amount && textList(existing?.benefits).length === 0) {
    benefits = [];
  }
  const projectId = text(item.projectId);
  return {
    base: {
      title,
      kind,
      category,
      organization: text(item.organization) ?? null,
      description: text(item.description) ?? null,
      eligibility: text(item.eligibility) ?? null,
      how_to_apply: stepsToTracker(item.applicationSteps),
      apply_url: applyUrl ?? null,
      deadline,
      location: text(item.location) ?? null,
      initiative_id: projectId ?? null,
      listing_status: listingStatusToTracker(item.status, deadline, existing ?? null, now),
    },
    extra: {
      county: text(item.county) ?? null,
      image_url: text(item.image) ?? null,
      benefits,
      requirements: textList(item.requirements),
    },
  };
}

// ---------------------------------------------------------------------------
// Applications  (§7)
// ---------------------------------------------------------------------------

const APPLICATION_READ: Record<string, ApplicationStatus> = {
  pending: "submitted",
  reviewed: "reviewing",
  shortlisted: "shortlisted",
  accepted: "accepted",
  rejected: "rejected",
};

const APPLICATION_WRITE: Record<ApplicationStatus, TrackerApplicationStatus> = {
  submitted: "pending",
  reviewing: "reviewed",
  shortlisted: "shortlisted",
  accepted: "accepted",
  rejected: "rejected",
};

export function applicationStatusFromTracker(status: string | null | undefined): ApplicationStatus {
  return (status && APPLICATION_READ[status]) || "submitted";
}

/**
 * Siasa status → Tracker status. `shortlisted` needs M6; before it the CHECK
 * constraint refuses the write and the repository answers 501. It is never
 * downgraded to `reviewed`.
 */
export function applicationStatusToTracker(status: ApplicationStatus): TrackerApplicationStatus {
  return APPLICATION_WRITE[status] ?? "pending";
}

export function applicationFromRow(row: ApplicationRow): OpportunityApplication {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    // Anonymous Tracker applications have no applicant account.
    applicantId: row.applicant_id ?? "",
    fullName: row.full_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    county: text(row.county),
    message: row.message ?? "",
    attachmentUrl: text(row.attachment_url),
    status: applicationStatusFromTracker(row.status),
    reviewNote: text(row.review_note),
    createdAt: row.created_at,
    updatedAt: text(row.updated_at) ?? row.created_at,
  };
}

/** Insert values for a new application. `applicant_id` must be auth.uid(). */
export function applicationInsertRow(item: OpportunityApplication, applicantId: string) {
  return {
    base: {
      opportunity_id: item.opportunityId,
      applicant_id: applicantId,
      full_name: item.fullName.trim(),
      email: item.email.trim().toLowerCase(),
      phone: text(item.phone) ?? null,
      message: text(item.message) ?? null,
      // New applications always start pending; reviewers change it.
      status: "pending" as TrackerApplicationStatus,
    },
    extra: {
      county: text(item.county) ?? null,
      attachment_url: text(item.attachmentUrl) ?? null,
    },
  };
}

/** Review update (the only update RLS allows: the opportunity author). */
export function applicationReviewPatch(item: OpportunityApplication) {
  return {
    base: { status: applicationStatusToTracker(item.status) },
    extra: { review_note: text(item.reviewNote) ?? null },
  };
}

// ---------------------------------------------------------------------------
// Adly interest leads → contact_submissions  (§13)
// ---------------------------------------------------------------------------

export const ADLY_SUBJECT_PREFIX = "Adly interest: ";

export function adlyInterestToRow(lead: AdlyInterestLead): ContactSubmissionRow {
  const organization = lead.organization.trim();
  const interests = lead.interests.map((item) => item.trim()).filter(Boolean);
  return {
    id: lead.id,
    name: lead.fullName.trim(),
    email: lead.email.trim().toLowerCase(),
    subject: `${ADLY_SUBJECT_PREFIX}${lead.role.trim()}${organization ? ` · ${organization}` : ""}`,
    message: `Phone: ${lead.phone.trim()}\nInterests: ${interests.length ? interests.join(", ") : "-"}`,
    created_at: lead.createdAt,
  };
}

export function isAdlyInterestRow(row: Pick<ContactSubmissionRow, "subject">): boolean {
  return (row.subject ?? "").startsWith(ADLY_SUBJECT_PREFIX);
}

export function adlyInterestFromRow(row: ContactSubmissionRow): AdlyInterestLead {
  const head = (row.subject ?? "").slice(ADLY_SUBJECT_PREFIX.length);
  const split = head.indexOf(" · ");
  const role = (split >= 0 ? head.slice(0, split) : head).trim();
  const organization = split >= 0 ? head.slice(split + 3).trim() : "";
  let phone = "";
  let interests: string[] = [];
  for (const line of row.message.split(/\r?\n/)) {
    const phoneMatch = /^Phone:\s*(.*)$/i.exec(line);
    if (phoneMatch) phone = phoneMatch[1].trim();
    const interestMatch = /^Interests:\s*(.*)$/i.exec(line);
    if (interestMatch) {
      interests = interestMatch[1]
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item && item !== "-");
    }
  }
  return {
    id: row.id,
    fullName: row.name,
    email: row.email,
    phone,
    organization,
    role,
    interests,
    createdAt: row.created_at,
  };
}
