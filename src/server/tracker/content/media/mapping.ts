import type { MediaCategory, MediaItem, MediaType } from "@/types";
import { eatDate, eatTimestamp, nullIfEmpty } from "./shared";

/**
 * MediaItem <-> public.blogs (content-mapping.md §8). Pure: no client here.
 *
 * NEW columns (M5b, not applied on 2026-10-22): `gallery text[]`, `video_url text`.
 * M1 adds a generated `slug`. Readers treat all three as optional; writers put
 * gallery/video_url in BLOG_NEW_COLUMNS so the repository can tell a missing
 * migration from a real error (one call site: writeBlog in repository.ts).
 */

export interface BlogRow {
  id: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;
  status: string;
  author_id: string;
  author_name: string;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  read_time?: string | null;
  tags?: string[] | null;
  initiative_id: string | null;
  initiative_name: string | null;
  /** NEW (M5b) */
  gallery?: string[] | null;
  /** NEW (M5b) */
  video_url?: string | null;
  /** NEW (M1), generated */
  slug?: string | null;
}

export const BLOG_NEW_COLUMNS = ["gallery", "video_url"] as const;

/** blogs.category written for each Siasa category. */
export const MEDIA_CATEGORY_TO_TRACKER: Record<MediaCategory, string> = {
  news: "News",
  "project-updates": "Project Updates",
  "leader-updates": "Leader Updates",
  videos: "Videos",
  stories: "Impact Stories",
};

const TRACKER_CATEGORY_TO_MEDIA: Record<string, MediaCategory> = {
  news: "news",
  government: "news",
  transparency: "news",
  "project updates": "project-updates",
  "leader updates": "leader-updates",
  videos: "videos",
  "impact stories": "stories",
  community: "stories",
};

/**
 * blogs.category -> MediaCategory. Case-insensitive. A known Tracker category
 * wins; an unknown or empty one becomes `videos` when the row has a video, else
 * `news` (§8). Deviation from the doc's "or any row with video_url": a known
 * category is kept even with a video, so a Project Update with a video
 * round-trips as project-updates instead of turning into videos.
 */
export function mediaCategoryFromTracker(category: string | null | undefined, videoUrl?: string | null): MediaCategory {
  const known = TRACKER_CATEGORY_TO_MEDIA[(category ?? "").trim().toLowerCase()];
  if (known) return known;
  return videoUrl?.trim() ? "videos" : "news";
}

/**
 * MediaCategory -> blogs.category. When the row's current Tracker category
 * already reads back as the same Siasa category (e.g. "Community" for stories),
 * it is kept, so a Siasa edit does not rename the Tracker's label.
 */
export function mediaCategoryToTracker(category: MediaCategory, current?: string | null): string {
  if (current && mediaCategoryFromTracker(current) === category && TRACKER_CATEGORY_TO_MEDIA[current.trim().toLowerCase()]) {
    return current;
  }
  return MEDIA_CATEGORY_TO_TRACKER[category] ?? "News";
}

/** video_url set -> video; content non-empty -> article; else image. */
export function mediaTypeOf(row: Pick<BlogRow, "video_url" | "content">): MediaType {
  if (row.video_url?.trim()) return "video";
  if (row.content?.trim()) return "article";
  return "image";
}

export interface BlogRelations {
  slug: string;
  leaderId?: string;
  relatedMediaIds?: string[];
  relatedOpportunityIds?: string[];
}

export function mapBlogRow(row: BlogRow, rel: BlogRelations): MediaItem {
  const videoUrl = row.video_url?.trim() || undefined;
  const gallery = (row.gallery ?? []).filter((url) => typeof url === "string" && url.trim());
  return {
    id: row.id,
    slug: rel.slug,
    title: row.title,
    category: mediaCategoryFromTracker(row.category, videoUrl),
    type: mediaTypeOf(row),
    image: row.image_url ?? "",
    gallery: gallery.length ? gallery : undefined,
    date: eatDate(row.published_at) || eatDate(row.created_at),
    excerpt: row.excerpt ?? "",
    body: row.content ?? "",
    videoUrl,
    leaderId: rel.leaderId,
    projectId: row.initiative_id ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    author: row.author_name || undefined,
    relatedOpportunityIds: rel.relatedOpportunityIds,
    relatedMediaIds: rel.relatedMediaIds,
  };
}

/**
 * published_at to write. Siasa has no drafts, so every save publishes.
 * - Insert: the chosen date when it is a past day, else now.
 * - Update: unchanged when the Siasa date is the same day as the stored one,
 *   else the newly chosen day (noon, Nairobi).
 */
export function publishedAtFor(date: string | undefined, existing: BlogRow | null, now = new Date()): string {
  const today = eatDate(now.toISOString());
  const chosen = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  if (existing?.published_at) {
    if (!chosen || eatDate(existing.published_at) === chosen) return existing.published_at;
    return eatTimestamp(chosen, "12:00:00") ?? existing.published_at;
  }
  if (chosen && chosen < today) return eatTimestamp(chosen, "12:00:00") ?? now.toISOString();
  return now.toISOString();
}

export interface BlogWriteContext {
  existing: BlogRow | null;
  /** blogs.author_name: the owner's political_figures.name, else their full name */
  ownerName?: string;
  /** initiatives.title for item.projectId (Tracker denormalises it) */
  initiativeName?: string | null;
  now?: Date;
}

/** Columns Siasa writes on blogs. author_id is added by the repository on insert only. */
export function blogWrite(item: MediaItem, ctx: BlogWriteContext): Record<string, unknown> {
  const now = ctx.now ?? new Date();
  const projectId = nullIfEmpty(item.projectId);
  return {
    title: item.title.trim(),
    excerpt: item.excerpt ?? "",
    content: item.body ?? "",
    image_url: nullIfEmpty(item.image),
    category: mediaCategoryToTracker(item.category, ctx.existing?.category),
    status: "published",
    published_at: publishedAtFor(item.date, ctx.existing, now),
    author_name:
      nullIfEmpty(item.author) ?? nullIfEmpty(ctx.ownerName) ?? ctx.existing?.author_name ?? "M-Taji",
    initiative_id: projectId,
    initiative_name: projectId ? ctx.initiativeName ?? ctx.existing?.initiative_name ?? null : null,
    gallery: (item.gallery ?? []).map((url) => url.trim()).filter(Boolean),
    video_url: nullIfEmpty(item.videoUrl),
  };
}

/** True when a write carries no data for the NEW columns, so dropping them loses nothing. */
export function blogNewColumnsEmpty(write: Record<string, unknown>): boolean {
  const gallery = write.gallery;
  return (!Array.isArray(gallery) || gallery.length === 0) && !write.video_url;
}
