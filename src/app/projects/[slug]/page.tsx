"use client";

import { use, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProjectHero, ProjectStats } from "@/components/project/ProjectHero";
import { Tabs } from "@/components/ui/Tabs";
import { GISMap } from "@/components/gis/GISMap";
import { MilestoneTimeline } from "@/components/project/MilestoneTimeline";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { MediaCard } from "@/components/cards/MediaCard";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { SafeImage } from "@/components/ui/SafeImage";
import { formatDate } from "@/lib/utils";
import { MEDIA_CATEGORY_LABELS } from "@/lib/constants";
import { Play } from "lucide-react";
import { useContent } from "@/components/content/ContentProvider";
import { LoadingState } from "@/components/ui/EmptyState";

const tabs = [
  { id: "about", label: "About" },
  { id: "gis", label: "GIS Location" },
  { id: "opportunities", label: "Opportunities" },
  { id: "media", label: "Media" },
  { id: "milestones", label: "Milestones" },
];

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const {
    ready,
    getProjectBySlug,
    getMilestonesByProject,
    getOpportunitiesByIds,
    getMediaByIds,
    content,
  } = useContent();
  const [active, setActive] = useState("about");

  const project = getProjectBySlug(slug);

  const milestones = useMemo(
    () => (project ? getMilestonesByProject(project.id) : []),
    [project, getMilestonesByProject]
  );
  const opps = useMemo(
    () => (project ? getOpportunitiesByIds(project.opportunityIds) : []),
    [project, getOpportunitiesByIds]
  );
  const media = useMemo(
    () => (project ? getMediaByIds(project.mediaIds) : []),
    [project, getMediaByIds]
  );
  const projectLeaders = useMemo(
    () =>
      project
        ? content.leaders.filter((l) => project.leaderIds.includes(l.id))
        : [],
    [project, content.leaders]
  );

  if (!ready) return <LoadingState />;
  if (!project) notFound();

  return (
    <>
      <ProjectHero project={project} />

      <div className="border-b border-border">
        <div className="container-wide">
          <Tabs items={tabs} activeId={active} onChange={setActive} />
        </div>
      </div>

      <section className="container-wide section-y-sm">
        {active === "about" && (
          <div className="space-y-10 animate-fade-in">
            <div className="max-w-3xl">
              <h2 className="text-h2 text-ink">About this project</h2>
              <p className="mt-4 text-body text-ink-muted">{project.description}</p>
            </div>
            <ProjectStats project={project} />
            {projectLeaders.length > 0 && (
              <div>
                <h3 className="text-h3 text-ink">Led by</h3>
                <ul className="mt-4 space-y-2">
                  {projectLeaders.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/leaders/${l.slug}`}
                        className="text-small text-accent hover:text-accent-hover"
                      >
                        {l.honorific} {l.name} — {l.position}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {active === "gis" && (
          <div className="space-y-6 animate-fade-in">
            <div className="max-w-2xl">
              <h2 className="text-h2 text-ink">GIS location</h2>
              <p className="mt-3 text-body text-ink-muted">
                Inspect the live project marker, boundary overlay and nearby
                geography. Switch between map and satellite basemaps.
              </p>
            </div>
            <GISMap
              center={project.geo.center}
              boundary={project.geo.boundary}
              projectName={project.name}
              locationLabel={project.location}
            />
          </div>
        )}

        {active === "milestones" && (
          <div className="space-y-6 animate-fade-in">
            <div className="max-w-2xl">
              <h2 className="text-h2 text-ink">Milestones</h2>
              <p className="mt-3 text-body text-ink-muted">
                Horizontal delivery track — from planning through completion.
              </p>
            </div>
            <MilestoneTimeline milestones={milestones} />
          </div>
        )}

        {active === "media" && (
          <div className="space-y-6 animate-fade-in">
            <div className="max-w-2xl">
              <h2 className="text-h2 text-ink">Media</h2>
              <p className="mt-3 text-body text-ink-muted">
                Images, field videos and editorial updates linked to this project.
              </p>
            </div>
            {media.length === 0 ? (
              <p className="text-small text-ink-muted">No media published yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {media.map((item) =>
                  item.type === "article" ? (
                    <MediaCard key={item.id} item={item} />
                  ) : (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-lg border border-border bg-surface"
                    >
                      <div className="relative aspect-[16/10]">
                        <SafeImage
                          src={item.image}
                          alt={item.title}
                          fill
                          className="object-cover"
                          sizes="(max-width:768px) 100vw, 50vw"
                        />
                        {item.type === "video" && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg/70 text-ink">
                              <Play className="h-5 w-5 fill-current" />
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="p-5">
                        <p className="meta-label text-accent">
                          {MEDIA_CATEGORY_LABELS[item.category]}
                        </p>
                        <h3 className="mt-2 text-h3 text-ink">{item.title}</h3>
                        <p className="mt-2 text-caption text-ink-subtle">
                          {formatDate(item.date)}
                        </p>
                        <p className="mt-3 text-small text-ink-muted">
                          {item.excerpt}
                        </p>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {active === "opportunities" && (
          <div className="space-y-8 animate-fade-in">
            <div className="max-w-2xl">
              <h2 className="text-h2 text-ink">Opportunities</h2>
              <p className="mt-3 text-body text-ink-muted">
                Economic and skills windows connected to this development.
              </p>
            </div>
            {opps.length === 0 ? (
              <p className="text-small text-ink-muted">
                No opportunities linked yet.
              </p>
            ) : (
              <CardCarousel label="Project opportunities">
                {opps.map((o) => (
                  <OpportunityCard key={o.id} opportunity={o} />
                ))}
              </CardCarousel>
            )}
            <FaidaBanner
              title="Want more opportunities?"
              body="Connect with Faida and receive relevant updates through WhatsApp."
              intent="opportunity"
            />
          </div>
        )}
      </section>
    </>
  );
}
