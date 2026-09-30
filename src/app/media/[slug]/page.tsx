"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { MediaCard } from "@/components/cards/MediaCard";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { SafeImage } from "@/components/ui/SafeImage";
import { useContent } from "@/components/content/ContentProvider";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  getRelatedLeader,
  getRelatedMedia,
  getRelatedOpportunities,
  getRelatedProject,
} from "@/lib/related-content";

function articleParagraphs(item: {
  body?: string;
  excerpt: string;
  title: string;
}): string[] {
  if (item.body?.trim()) {
    return item.body
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return [
    item.excerpt,
    `This story is published on M-Taji Siasa to help citizens follow development with clear context — linking narrative, location and related civic opportunities where they exist.`,
    `Always verify project status on the linked project page. Conceptual or simulated imagery, if present, is labelled separately from completed public works.`,
  ];
}

export default function MediaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, content, getMediaBySlug } = useContent();
  const item = getMediaBySlug(slug);

  const pool = useMemo(
    () => ({
      opportunities: content.opportunities,
      media: content.media,
      projects: content.projects,
      leaders: content.leaders,
    }),
    [content]
  );

  const relatedProject = useMemo(
    () => getRelatedProject(pool, item?.projectId),
    [pool, item?.projectId]
  );
  const relatedLeader = useMemo(
    () => getRelatedLeader(pool, item?.leaderId),
    [pool, item?.leaderId]
  );
  const relatedOpps = useMemo(
    () =>
      item
        ? getRelatedOpportunities(pool, {
            id: item.id,
            county: relatedProject?.county,
            projectId: item.projectId,
            leaderId: item.leaderId,
            relatedIds: item.relatedOpportunityIds,
          })
        : [],
    [pool, item, relatedProject?.county]
  );
  const relatedStories = useMemo(
    () =>
      item
        ? getRelatedMedia(pool, {
            id: item.id,
            category: item.category,
            county: relatedProject?.county,
            projectId: item.projectId,
            leaderId: item.leaderId,
            relatedIds: item.relatedMediaIds,
          })
        : [],
    [pool, item, relatedProject?.county]
  );

  if (!ready) return <LoadingState label="Loading story…" />;
  if (!item) {
    return (
      <section className="container-wide section-y">
        <EmptyState
          title="Story not found"
          description="We couldn't find the media story you're looking for."
          action={
            <Button href="/media" variant="outline">
              Explore Media
            </Button>
          }
        />
      </section>
    );
  }

  const paragraphs = articleParagraphs(item);

  return (
    <>
      <section className="border-b border-border">
        <div className="container-wide py-8 md:py-10">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Media", href: "/media" },
              {
                label: MEDIA_CATEGORY_LABELS[item.category],
                href: "/media",
              },
              { label: item.title },
            ]}
          />
          <p className="meta-label mt-6 text-accent">
            {MEDIA_CATEGORY_LABELS[item.category]}
          </p>
          <h1 className="mt-3 max-w-4xl text-h1 text-ink md:text-display">
            {item.title}
          </h1>
          <p className="mt-4 max-w-3xl text-body text-ink-muted">{item.excerpt}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-subtle">
            <span>Published {formatDate(item.date)}</span>
            {item.updatedAt && (
              <span>Updated {formatDate(item.updatedAt)}</span>
            )}
            {item.author && <span>{item.author}</span>}
            {relatedLeader && (
              <Link
                href={`/leaders/${relatedLeader.slug}`}
                className="text-accent hover:text-accent-hover"
              >
                {relatedLeader.honorific} {relatedLeader.name}
              </Link>
            )}
          </div>
          <div className="mt-6">
            <ShareButton title={item.title} />
          </div>
        </div>
        <div className="relative aspect-[21/9] w-full bg-bg-elevated md:aspect-[2.4/1]">
          <SafeImage
            src={item.image}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        </div>
      </section>

      <article className="container-wide section-y-sm">
        <div className="mx-auto max-w-narrow">
          {item.type === "video" && item.videoUrl && (
            <div className="mb-8 overflow-hidden rounded-lg border border-border bg-surface p-4">
              <p className="meta-label text-accent">Video</p>
              <p className="mt-2 text-small text-ink-muted">
                Field capture linked to this story. Prototype embeds the source
                URL for reference.
              </p>
              <a
                href={item.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-small text-accent hover:text-accent-hover"
              >
                Open video source →
              </a>
            </div>
          )}

          <div className="space-y-6">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-body leading-relaxed text-ink-muted">
                {p}
              </p>
            ))}
          </div>

          {paragraphs.length > 1 && (
            <blockquote className="mt-10 border-l-2 border-accent pl-5 text-h3 text-ink">
              Development you can see — verified against place, time and public
              record.
            </blockquote>
          )}
        </div>
      </article>

      {relatedProject && (
        <section className="border-t border-border bg-bg-elevated">
          <div className="container-wide section-y-sm">
            <h2 className="text-h2 text-ink">Related project</h2>
            <div className="mt-6 max-w-md">
              <ProjectCard project={relatedProject} />
            </div>
          </div>
        </section>
      )}

      {relatedOpps.length > 0 && (
        <section className="border-t border-border">
          <div className="container-wide section-y-sm">
            <h2 className="text-h2 text-ink">Opportunities from this story</h2>
            <p className="mt-2 max-w-2xl text-small text-ink-muted">
              Move from information to action with opportunities linked to this
              context.
            </p>
            <CardCarousel
              label="Opportunities from this story"
              gridClassName="md:grid-cols-2 lg:grid-cols-4"
              className="mt-6"
            >
              {relatedOpps.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} />
              ))}
            </CardCarousel>
          </div>
        </section>
      )}

      {relatedStories.length > 0 && (
        <section className="border-t border-border bg-bg-elevated">
          <div className="container-wide section-y-sm">
            <h2 className="text-h2 text-ink">Related stories</h2>
            <CardCarousel
              label="Related stories"
              gridClassName="md:grid-cols-2 lg:grid-cols-4"
              className="mt-6"
            >
              {relatedStories.map((m) => (
                <MediaCard key={m.id} item={m} />
              ))}
            </CardCarousel>
          </div>
        </section>
      )}

      <section className="container-wide section-y-sm">
        <FaidaBanner
          title="Stay connected"
          body="Get updates and opportunities relevant to you through Faida by M-Taji."
          intent="updates"
        />
      </section>
    </>
  );
}
