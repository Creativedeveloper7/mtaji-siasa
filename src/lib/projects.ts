import {
  TRACKER_PROJECT_CATEGORIES,
  categoryBucket,
  categoryLabel,
} from "@/server/tracker/content/projects/mapping";

/**
 * Project categories as the Tracker stores them (initiatives.category). Siasa's
 * Project.subcategory holds one of these values; Project.category is the
 * infrastructure / non-infrastructure bucket derived from it. The mapping file
 * is pure (types only), so client components can use it.
 */
export { TRACKER_PROJECT_CATEGORIES, categoryBucket };

/** Display label of a subcategory: the Tracker label, or the text itself for older free-text values. */
export function projectTypeLabel(subcategory: string | undefined): string {
  if (!subcategory) return "Other";
  return TRACKER_PROJECT_CATEGORIES.some((c) => c.value === subcategory) ? categoryLabel(subcategory) : subcategory;
}

/** Where a new project's map pin starts (Nairobi CBD). */
export const DEFAULT_MAP_CENTER = { lat: -1.2864, lng: 36.8172 } as const;
