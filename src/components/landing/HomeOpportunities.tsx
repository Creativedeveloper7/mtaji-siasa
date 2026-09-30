"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import type { Opportunity } from "@/types";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { SearchBar } from "@/components/ui/SearchBar";
import { OPPORTUNITY_CATEGORY_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const SAVED_KEY = "mtaji-siasa-saved-opportunities-v1";

function eligibilityGroup(o: Opportunity): string {
  const text = o.eligibility.toLowerCase();
  if (text.includes("supplier") || text.includes("enterprise") || text.includes("trader"))
    return "Local suppliers";
  if (text.includes("young") || text.includes("youth") || text.includes("18"))
    return "Young residents";
  if (text.includes("contractor") || text.includes("engineer") || text.includes("qualified"))
    return "Qualified contractors";
  return "Community members";
}

const selectClass =
  "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-small text-ink transition-colors hover:border-accent/40 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30";

export function HomeOpportunities({
  items,
  layout = "carousel",
  searchable = false,
}: {
  items: Opportunity[];
  /** "carousel" scrolls at every size; "grid" becomes a grid from md upward */
  layout?: "carousel" | "grid";
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [location, setLocation] = useState("all");
  const [eligibility, setEligibility] = useState("all");
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSave = (id: string) => {
    setSaved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const options = useMemo(
    () => ({
      types: Array.from(new Set(items.map((o) => o.category))),
      locations: Array.from(new Set(items.map((o) => o.location))),
      eligibility: Array.from(new Set(items.map(eligibilityGroup))),
    }),
    [items]
  );

  const q = query.toLowerCase().trim();
  const filtered = items.filter(
    (o) =>
      (!q ||
        o.title.toLowerCase().includes(q) ||
        o.location.toLowerCase().includes(q) ||
        o.eligibility.toLowerCase().includes(q)) &&
      (type === "all" || o.category === type) &&
      (location === "all" || o.location === location) &&
      (eligibility === "all" || eligibilityGroup(o) === eligibility) &&
      (!savedOnly || saved.includes(o.id))
  );

  return (
    <div>
      {searchable && (
        <SearchBar
          id="opportunity-search"
          label="Search"
          value={query}
          onChange={setQuery}
          placeholder="Search by title, place or who can apply…"
          className="mb-3"
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="block">
          <span className="mb-1.5 block text-caption font-bold text-ink">
            Opportunity type
          </span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
            <option value="all">All types</option>
            {options.types.map((t) => (
              <option key={t} value={t}>
                {OPPORTUNITY_CATEGORY_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-caption font-bold text-ink">Location</span>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={selectClass}
          >
            <option value="all">All locations</option>
            {options.locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-caption font-bold text-ink">Eligibility</span>
          <select
            value={eligibility}
            onChange={(e) => setEligibility(e.target.value)}
            className={selectClass}
          >
            <option value="all">All eligibility</option>
            {options.eligibility.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSavedOnly((v) => !v)}
          aria-pressed={savedOnly}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-small font-bold transition-colors",
            savedOnly
              ? "border-accent/60 bg-accent-soft text-accent"
              : "border-border-strong bg-surface text-ink hover:border-accent/40"
          )}
        >
          <Bookmark className={cn("h-4 w-4", savedOnly && "fill-current")} aria-hidden />
          Saved ({saved.length})
        </button>
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        Saved listings stay on this device. Applications and current details
        open in the live app.
      </p>
      {layout === "grid" && (
        <p className="mt-6 text-caption font-bold text-ink" aria-live="polite">
          Showing {filtered.length} of {items.length} opportunities
        </p>
      )}

      <div className={layout === "grid" ? "mt-4" : "mt-8"}>
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-strong px-6 py-12 text-center">
            <p className="font-bold text-ink">
              {savedOnly ? "No saved opportunities yet." : "No opportunities match these filters."}
            </p>
            <p className="mt-2 text-small text-ink-muted">
              {savedOnly
                ? "Tap the bookmark on any opportunity to keep it here."
                : "Try another type, location or eligibility."}
            </p>
          </div>
        ) : (
          <CardCarousel
            key={filtered.map((o) => o.id).join("|")}
            label="Development opportunities"
            desktop={layout}
          >
            {filtered.map((o) => (
              <div key={o.id} id={o.slug} className="h-full scroll-mt-24">
                <OpportunityCard
                  opportunity={o}
                  saved={saved.includes(o.id)}
                  onToggleSave={toggleSave}
                />
              </div>
            ))}
          </CardCarousel>
        )}
      </div>
    </div>
  );
}
