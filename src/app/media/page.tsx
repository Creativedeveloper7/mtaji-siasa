"use client";

import { useMemo, useState } from "react";
import { MediaCard } from "@/components/cards/MediaCard";
import { PageHeader } from "@/components/project/ProjectHero";
import { SearchBar } from "@/components/ui/SearchBar";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";
import type { MediaCategory } from "@/types";
import { useContent } from "@/components/content/ContentProvider";

const categories: Array<"all" | MediaCategory> = [
  "all",
  "news",
  "project-updates",
  "leader-updates",
  "videos",
  "stories",
];

export default function MediaPage() {
  const { content, ready } = useContent();
  const [category, setCategory] = useState<"all" | MediaCategory>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return content.media.filter((m) => {
      const matchesCategory = category === "all" || m.category === category;
      const matchesQuery =
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.excerpt.toLowerCase().includes(q) ||
        (m.body?.toLowerCase().includes(q) ?? false) ||
        MEDIA_CATEGORY_LABELS[m.category].toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [content.media, category, query]);

  if (!ready) return <LoadingState />;

  const [featured, ...rest] = filtered;

  return (
    <>
      <PageHeader
        title="Media"
        description="An editorial lens on leaders, projects and community stories."
      >
        <div className="space-y-4">
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none" }}
          >
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
                {c === "all" ? "All" : MEDIA_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search media by title, story or type…"
            id="media-search"
          />
        </div>
      </PageHeader>

      <section className="container-wide section-y-sm space-y-6">
        {filtered.length === 0 ? (
          <EmptyState
            title="No media found"
            description="Try a different search or category filter."
          />
        ) : (
          <>
            {featured && (
              <div id={featured.slug}>
                <MediaCard item={featured} featured />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((item) => (
                <div key={item.id} id={item.slug}>
                  <MediaCard item={item} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
