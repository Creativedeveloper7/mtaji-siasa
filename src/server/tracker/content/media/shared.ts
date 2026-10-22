/**
 * Pure helpers shared by the media, polls and products slices (no Supabase
 * client, no server-only import, so tests load them directly). They live here
 * because this slice may only create files under content/{media,polls,products};
 * they can move to a common content module later without changing behaviour.
 */

/** A political_figures row, reduced to what content ownership needs. */
export interface FigureRef {
  id: string;
  user_id: string | null;
  name: string | null;
  created_at?: string | null;
}

/**
 * user id -> that user's political_figures row. When a user has several rows
 * the newest wins (same rule as AuthSession.leaderId in roles.ts).
 */
export function indexFiguresByUser(rows: FigureRef[]): Map<string, FigureRef> {
  const out = new Map<string, FigureRef>();
  const sorted = [...rows].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const row of sorted) {
    if (row.user_id && !out.has(row.user_id)) out.set(row.user_id, row);
  }
  return out;
}

/**
 * Siasa leaderId for a row owned by `ownerId` (blogs.author_id, polls.owner_id,
 * products.author_id).
 *
 * - The owner's political_figures.id when they have one.
 * - Otherwise the owner's auth user id. tracker-backend.md (Phase 1): a session
 *   with no political_figures row uses the Supabase user id as its leaderId, so
 *   this keeps the content service's `leaderId === actor.leaderId` ownership
 *   check working for those users. findLeader(<user id>) simply finds nothing.
 * - undefined when the row has no owner (products.author_id is nullable).
 */
export function leaderIdForOwner(
  ownerId: string | null | undefined,
  figures: Map<string, FigureRef>
): string | undefined {
  if (!ownerId) return undefined;
  return figures.get(ownerId)?.id ?? ownerId;
}

/** Kenya is UTC+3 all year (no DST). */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date (YYYY-MM-DD) of a timestamp in Nairobi. "" when missing or invalid. */
export function eatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  return new Date(time + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * A Siasa date input as a timestamptz string.
 * - "YYYY-MM-DD" becomes that day at `time` Nairobi time.
 * - A full timestamp is passed through (normalised to ISO).
 * - Empty or invalid input gives null.
 */
export function eatTimestamp(value: string | null | undefined, time = "23:59:59"): string | null {
  const text = value?.trim();
  if (!text) return null;
  if (DATE_ONLY.test(text)) {
    const parsed = Date.parse(`${text}T${time}+03:00`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Empty or whitespace-only text becomes null (Tracker nullable text columns). */
export function nullIfEmpty(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** Rows whose id is in `ids`, in list order (the memory adapter does the same). */
export function pickByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
  const wanted = new Set(ids);
  return items.filter((item) => wanted.has(item.id));
}

/** Group ids by an owner column, for the leaders slice's link arrays. */
export function groupIdsByOwner<T extends { id: string }>(
  rows: T[],
  ownerOf: (row: T) => string | null | undefined
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const owner = ownerOf(row);
    if (!owner) continue;
    const list = out.get(owner) ?? [];
    list.push(row.id);
    out.set(owner, list);
  }
  return out;
}

/** True when a PostgREST error says a column is unknown (a migration not applied yet). */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null | undefined,
  columns: string[]
): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  const unknownColumn = error.code === "PGRST204" || error.code === "42703" || /column/i.test(message);
  return unknownColumn && columns.some((column) => message.includes(column));
}

/** True when a PostgREST error says a function does not exist (a migration not applied yet). */
export function isMissingFunctionError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
}
