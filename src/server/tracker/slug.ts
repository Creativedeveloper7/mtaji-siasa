/**
 * Slugs for Tracker rows. Matches the Tracker app's own formula
 * (slugifyProfileName / initiativesRepository slugify) so a link copied from
 * either app opens the same record. No length cap, unlike slugify() in
 * src/lib/store.ts: a cap would stop long titles matching the Tracker.
 */
export function baseSlug(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Projects fall back to the full id, like the Tracker; everything else to 8 chars. */
export function rowSlug(
  text: string | null | undefined,
  id: string,
  fallback: "short-id" | "full-id" = "short-id"
): string {
  return baseSlug(text) || (fallback === "full-id" ? id : id.slice(0, 8));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Gives every row a unique route slug. When two rows share a base slug, each
 * of them gets `-<first 8 chars of id>` appended.
 */
export function assignSlugs<T extends { id: string }>(
  rows: T[],
  textOf: (row: T) => string | null | undefined,
  fallback: "short-id" | "full-id" = "short-id"
): Map<string, string> {
  const bases = rows.map((row) => rowSlug(textOf(row), row.id, fallback));
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const slugs = new Map<string, string>();
  rows.forEach((row, index) => {
    const base = bases[index];
    slugs.set(row.id, (counts.get(base) ?? 0) > 1 ? `${base}-${row.id.slice(0, 8)}` : base);
  });
  return slugs;
}

/** Finds a row by route slug or raw uuid. */
export function findBySlug<T extends { id: string }>(
  rows: T[],
  slugs: Map<string, string>,
  slugOrId: string
): T | undefined {
  if (isUuid(slugOrId)) return rows.find((row) => row.id === slugOrId);
  return rows.find((row) => slugs.get(row.id) === slugOrId);
}
