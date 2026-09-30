"use client";

import { useMemo, useState } from "react";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { PageHeader } from "@/components/project/ProjectHero";
import { SearchBar } from "@/components/ui/SearchBar";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { OPPORTUNITY_CATEGORY_LABELS } from "@/lib/constants";
import type { OpportunityCategory } from "@/types";
import { useContent } from "@/components/content/ContentProvider";

const categories: Array<"all" | OpportunityCategory> = [
  "all",
  "jobs",
  "tenders",
  "training",
  "funding",
  "youth",
  "business",
  "other",
];

export default function OpportunitiesPage() {
  const { content, ready } = useContent();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | OpportunityCategory>("all");

  const filtered = useMemo(() => {
    return content.opportunities.filter((o) => {
      const q = query.toLowerCase().trim();
      const matchesQuery =
        !q ||
        o.title.toLowerCase().includes(q) ||
        o.location.toLowerCase().includes(q) ||
        o.eligibility.toLowerCase().includes(q);
      const matchesCategory = category === "all" || o.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [content.opportunities, query, category]);

  if (!ready) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Discover opportunities connected to communities, projects and public programmes."
      >
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`h-9 shrink-0 rounded-md border px-3 text-small transition-colors ${
                  category === c
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-border text-ink-muted hover:border-border-strong hover:text-ink"
                }`}
              >
                {c === "all" ? "All" : OPPORTUNITY_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search opportunities…"
          />
        </div>
      </PageHeader>

      <section className="container-wide section-y-sm space-y-12">
        {filtered.length === 0 ? (
          <EmptyState
            title="No opportunities match"
            description="Try another category or search term."
          />
        ) : (
          <CardCarousel
            key={filtered.map((o) => o.id).join("|")}
            label="Opportunities"
          >
            {filtered.map((opp) => (
              <div key={opp.id} id={opp.slug} className="h-full">
                <OpportunityCard opportunity={opp} />
              </div>
            ))}
          </CardCarousel>
        )}
        <FaidaBanner
          title="Want more opportunities?"
          body="Connect with Faida and receive relevant updates through WhatsApp."
          intent="opportunity"
        />
      </section>
    </>
  );
}
