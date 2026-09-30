"use client";

import { useMemo, useState } from "react";
import { MediaCard } from "@/components/cards/MediaCard";
import { PageHero } from "@/components/layout/PageHero";
import { SectionIntro } from "@/components/layout/SectionIntro";
import { ClosingBand } from "@/components/layout/ClosingBand";
import { SearchBar } from "@/components/ui/SearchBar";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { FilterChips } from "@/components/ui/FilterBar";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";
import type { MediaCategory } from "@/types";
import { useContent } from "@/components/content/ContentProvider";
import { useFaida } from "@/components/faida/FaidaProvider";

const categories: Array<"all" | MediaCategory> = [
  "all",
  "news",
  "project-updates",
  "leader-updates",
  "videos",
  "stories",
];

const categoryOptions = categories.map((c) => ({
  value: c,
  label: c === "all" ? "Everything" : MEDIA_CATEGORY_LABELS[c],
}));

export default function MediaPage() {
  const { content, ready } = useContent();
  const { openFaida } = useFaida();
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

  const media = content.media;
  const videos = media.filter((m) => m.type === "video").length;
  const projectUpdates = media.filter((m) => m.category === "project-updates").length;
  const leaderUpdates = media.filter((m) => m.category === "leader-updates").length;
  const [featured, ...rest] = filtered;

  return (
    <>
      <PageHero
        eyebrow="Stories from the ground"
        titleText="See the progress. Hear the stories."
        title={
          <>
            See the progress.
            <br />
            <em className="script-accent text-accent">Hear the stories.</em>
          </>
        }
        description="Photos, videos and short updates from the places where the work is happening. Watch a road take shape, hear from the families using a new water point and follow what your leaders are saying. Real people, real places, told simply."
        image="/home/product-faida.jpg"
        imageAlt="Illustrative photo of residents sharing a project update on their phones"
        primary={{ label: "Browse stories", href: "#browse" }}
        secondary={{ label: "Explore projects", href: "/projects" }}
        stats={[
          { value: media.length, label: "Stories" },
          { value: videos, label: "Videos" },
          { value: projectUpdates, label: "Project updates" },
          { value: leaderUpdates, label: "Leader updates" },
        ]}
        stepsLabel="How to use this page"
        steps={[
          {
            title: "Pick a topic",
            body: "Choose news, project updates, leader updates, videos or community stories.",
          },
          {
            title: "Watch and read",
            body: "Each story links back to the project or leader it is about.",
          },
          {
            title: "Share it",
            body: "Send a story to friends and family so more people know what is happening.",
          },
        ]}
      />

      <section id="browse" className="scroll-mt-20 bg-bg py-18 md:py-22">
        <div className="container-wide">
          <SectionIntro
            eyebrow="Media"
            title={
              <>
                Stories that show{" "}
                <em className="script-accent text-brand-green">the work.</em>
              </>
            }
            body="Start with the featured story, then filter by topic or search for a place, project or leader."
          />

          <div className="space-y-4">
            <FilterChips
              label="Topic"
              value={category}
              options={categoryOptions}
              onChange={setCategory}
            />
            <SearchBar
              id="media-search"
              label="Search"
              value={query}
              onChange={setQuery}
              placeholder="Search by title, story or type…"
            />
          </div>

          <p className="mt-6 text-caption font-bold text-ink" aria-live="polite">
            Showing {filtered.length} of {media.length} stories
          </p>

          <div className="mt-4 space-y-6">
            {filtered.length === 0 ? (
              <EmptyState
                title="No stories found"
                description="Try a different topic or search term."
              />
            ) : (
              <>
                {featured && (
                  <div id={featured.slug} className="scroll-mt-24">
                    <MediaCard item={featured} featured />
                  </div>
                )}
                {rest.length > 0 && (
                  <CardCarousel key={rest.map((m) => m.id).join("|")} label="More stories">
                    {rest.map((item) => (
                      <div key={item.id} id={item.slug} className="h-full scroll-mt-24">
                        <MediaCard item={item} />
                      </div>
                    ))}
                  </CardCarousel>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <ClosingBand
        eyebrow="M-Taji Faida"
        title={
          <>
            Get new stories{" "}
            <em className="script-accent text-accent">on WhatsApp.</em>
          </>
        }
        body="Connect with M-Taji Faida to receive project updates and community stories from your area as they happen."
        actionLabel="Connect with Faida"
        onAction={() => openFaida("updates")}
      />
    </>
  );
}
