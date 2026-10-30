"use client";

import { X } from "lucide-react";
import { AdminField, AdminSelect } from "@/components/admin/AdminUI";
import { AD_AGE_GROUPS, AD_ALL_KENYA, AD_MAX_COUNTIES, KENYA_COUNTIES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Where an ad runs and to whom, as the composer and the update dialog edit it. */
export interface AdAudienceValue {
  /** County names; empty = all of Kenya */
  counties: string[];
  ageGroup: string;
}

/** The ad's stored locations ("Kenya" or counties) as the form's value. */
export function audienceFromAd(locations: string[] | undefined, ageGroup: string | undefined): AdAudienceValue {
  return {
    counties: (locations ?? []).filter((l) => (KENYA_COUNTIES as readonly string[]).includes(l)),
    ageGroup: AD_AGE_GROUPS.some((g) => g.value === ageGroup) ? (ageGroup as string) : AD_AGE_GROUPS[0].value,
  };
}

/** The request fields for an audience. */
export function audienceBody(value: AdAudienceValue) {
  return { locations: value.counties.length ? value.counties : [AD_ALL_KENYA], ageGroup: value.ageGroup };
}

export function AdAudienceFields({ value, onChange }: { value: AdAudienceValue; onChange: (next: AdAudienceValue) => void }) {
  const everywhere = value.counties.length === 0;
  const unused = KENYA_COUNTIES.filter((c) => !value.counties.includes(c));
  const full = value.counties.length >= AD_MAX_COUNTIES;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="meta-label">Where</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={everywhere}
            onClick={() => onChange({ ...value, counties: [] })}
            className={cn(
              "min-h-[36px] rounded-full border px-3 text-caption transition-colors",
              everywhere ? "border-accent bg-accent text-ink-inverse" : "border-border text-ink-muted hover:text-ink"
            )}
          >
            All of Kenya
          </button>
          {value.counties.map((county) => (
            <span
              key={county}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-accent bg-accent-soft py-1 pl-3 pr-1 text-caption text-ink"
            >
              {county}
              <button
                type="button"
                onClick={() => onChange({ ...value, counties: value.counties.filter((c) => c !== county) })}
                className="rounded-full p-1 text-ink-muted hover:text-ink"
                aria-label={`Remove ${county}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
        <AdminSelect
          value=""
          disabled={full}
          aria-label="Add a county"
          onChange={(e) => e.target.value && onChange({ ...value, counties: [...value.counties, e.target.value] })}
        >
          <option value="">{full ? `Up to ${AD_MAX_COUNTIES} counties` : everywhere ? "Or choose counties…" : "Add another county…"}</option>
          {unused.map((county) => (
            <option key={county} value={county}>
              {county}
            </option>
          ))}
        </AdminSelect>
        <p className="text-caption text-ink-subtle">
          X can only target Kenya by region, so on X a county ad shows across its region (for example Kiambu → Central).
        </p>
      </div>

      <AdminField label="Age">
        <AdminSelect value={value.ageGroup} onChange={(e) => onChange({ ...value, ageGroup: e.target.value })}>
          {AD_AGE_GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </AdminSelect>
      </AdminField>
    </div>
  );
}
