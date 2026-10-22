/**
 * Row shapes of the Tracker tables this slice reads and writes, as they are in
 * the live schema (project jdddchjbglilkfrlenci, read 2026-10-22), plus the
 * columns docs/content-mapping.md §17 proposes (marked NEW). NEW columns are
 * optional here: until the migration ships they are simply absent from rows.
 */

export interface InitiativeRow {
  id: string;
  changemaker_id: string;
  title: string;
  short_description: string | null;
  description: string;
  /** One of TRACKER_CATEGORY_VALUES (check constraint). */
  category: string;
  target_amount?: number | string;
  raised_amount?: number | string;
  /** jsonb, NOT NULL default '{}'. Shape varies; see parseLocation. */
  location: unknown;
  project_duration?: string | null;
  expected_completion: string | null;
  reference_images: string[] | null;
  /** jsonb. Never written by Siasa. */
  payment_details?: unknown;
  /** draft | published | active | completed | stalled */
  status: string;
  created_at: string | null;
  updated_at?: string | null;
  /** jsonb array. Never written by Siasa. */
  satellite_snapshots?: unknown;
  /** jsonb. Never written by Siasa. */
  opportunity_preferences?: unknown;
  /** NEW (M4) */
  start_date?: string | null;
  /** NEW (M4) smallint 0–100 */
  progress_percent?: number | null;
  /** NEW (M1) generated column. Read only. */
  slug?: string | null;
}

export interface MilestoneRow {
  id: string;
  initiative_id: string;
  title: string;
  target_date: string;
  /** pending | in_progress | completed | delayed | cancelled */
  status: string;
  description: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at?: string | null;
  /** NEW (M4) */
  image_url?: string | null;
}

export interface ChangemakerRow {
  id: string;
  user_id: string | null;
  name: string;
}

export interface FigureLinkRow {
  id: string;
  user_id: string | null;
  commissioned_projects: string[] | null;
}

/** Columns from §17 that may not exist yet. Writes include them only when present. */
export const NEW_INITIATIVE_COLUMNS = ["start_date", "progress_percent"] as const;
export const NEW_MILESTONE_COLUMNS = ["image_url"] as const;
