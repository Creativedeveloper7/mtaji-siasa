"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { AiSimulationBadge } from "@/components/project/ProjectHero";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { SafeImage } from "@/components/ui/SafeImage";
import { useContent } from "@/components/content/ContentProvider";
import { LoadingState } from "@/components/ui/EmptyState";

export default function LeaderVisionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug } = useContent();
  if (!ready) return <LoadingState />;
  const leader = getLeaderBySlug(slug);
  if (!leader?.vision) notFound();
  const vision = leader.vision;

  return (
    <>
      <ProfileHeader leader={leader} activeTab="vision" />
      <section className="container-wide section-y-sm space-y-14">
        <div className="max-w-3xl">
          <p className="meta-label text-accent">Vision</p>
          <h2 className="mt-3 text-h1 text-ink">
            <span className="editorial-serif text-accent">What we stand for</span>
          </h2>
          <p className="mt-5 text-body text-ink-muted">{vision.statement}</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h3 className="text-h3 text-ink">Manifesto</h3>
            <ul className="mt-5 space-y-3">
              {vision.manifesto.map((item) => (
                <li
                  key={item}
                  className="border-b border-border pb-3 text-small text-ink-muted"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-h3 text-ink">Priorities</h3>
            <ul className="mt-5 flex flex-wrap gap-2">
              {vision.priorities.map((p) => (
                <li
                  key={p}
                  className="rounded-md border border-border bg-surface px-3 py-2 text-small text-ink-muted"
                >
                  {p}
                </li>
              ))}
            </ul>
            <h3 className="mt-10 text-h3 text-ink">Expected impact</h3>
            <ul className="mt-5 space-y-3">
              {vision.expectedImpact.map((item) => (
                <li key={item} className="flex gap-3 text-small text-ink-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <div className="mb-3">
            <AiSimulationBadge />
          </div>
          <h2 className="mt-4 text-h2 text-ink">What could this look like?</h2>
          <p className="mt-3 max-w-2xl text-body text-ink-muted">
            Conceptual AI-generated development simulations. These are proposed
            visions — not completed projects.
          </p>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            {vision.proposedProjects.map((proj) => (
              <article
                key={proj.id}
                className="overflow-hidden rounded-lg border border-border-accent bg-surface"
              >
                <div className="relative aspect-[16/10]">
                  <SafeImage
                    src={proj.simulationImage}
                    alt={`Conceptual visualisation: ${proj.title}`}
                    fill
                    className="object-cover"
                    sizes="(max-width:1024px) 100vw, 50vw"
                  />
                  <div className="absolute left-3 top-3">
                    <AiSimulationBadge />
                  </div>
                </div>
                <div className="p-5 md:p-6">
                  <p className="meta-label">{proj.location}</p>
                  <h3 className="mt-2 text-h3 text-ink">{proj.title}</h3>
                  <p className="mt-3 text-small text-ink-muted">{proj.description}</p>
                  <p className="mt-4 text-small text-ink-subtle">
                    <span className="text-ink-muted">Expected impact: </span>
                    {proj.expectedImpact}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <FaidaBanner
          title="Help shape this vision"
          body="Join the conversation, volunteer or follow updates through Faida on WhatsApp."
          intent="movement"
        />
      </section>
    </>
  );
}
