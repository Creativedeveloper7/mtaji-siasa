import { AD_AGE_GROUPS, AD_ALL_KENYA, AD_MAX_COUNTIES, KENYA_COUNTIES } from "@/lib/constants";

/** Where an ad runs and to whom. */
export interface AdAudience {
  /** County names, or ["Kenya"] */
  locations: string[];
  /** One of AD_AGE_GROUPS */
  ageGroup: string;
}

/**
 * The audience from a request body ({ locations, ageGroup }), or why it can't be
 * used. No counties (or "Kenya") means all of Kenya; no age group means every adult.
 */
export function parseAdAudience(body: Record<string, unknown>): AdAudience | string {
  const raw = Array.isArray(body.locations) ? body.locations : [];
  const counties = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return "Choose counties from the list.";
    const name = item.trim();
    if (!name || name.toLowerCase() === AD_ALL_KENYA.toLowerCase()) continue;
    const county = KENYA_COUNTIES.find((c) => c.toLowerCase() === name.toLowerCase());
    if (!county) return `"${name}" is not a Kenyan county.`;
    counties.add(county);
  }
  if (counties.size > AD_MAX_COUNTIES) return `Choose at most ${AD_MAX_COUNTIES} counties, or all of Kenya.`;
  const ageGroup = typeof body.ageGroup === "string" && body.ageGroup ? body.ageGroup : AD_AGE_GROUPS[0].value;
  if (!AD_AGE_GROUPS.some((g) => g.value === ageGroup)) return "Choose an age group from the list.";
  return { locations: counties.size ? Array.from(counties) : [AD_ALL_KENYA], ageGroup };
}
