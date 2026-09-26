"use client";

import Image from "next/image";
import { LandingHero } from "@/components/landing/LandingHero";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { Button } from "@/components/ui/Button";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { AiSimulationBadge, SectionHeader } from "@/components/project/ProjectHero";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useContent } from "@/components/content/ContentProvider";
import { LoadingState } from "@/components/ui/EmptyState";

export default function HomePage() {
  const { content, ready } = useContent();

  if (!ready) return <LoadingState label="Loading platform…" />;

  const featuredProjects = content.projects.slice(0, 3);
  const featuredOpps = content.opportunities.slice(0, 3);

  return (
    <>
      <LandingHero />

      <section id="platform" className="section-y border-t border-border">
        <div className="container-wide">
          <SectionHeader
            eyebrow="Platform"
            title="Development you can see."
            description="M-Taji Siasa is the visual discovery layer for public development — who leads, what is being built, where it sits on the map, and how citizens can engage through Faida."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                for: "For Leaders",
                title: "Showcase your record.",
                body: "Publish projects with locations, milestones, media and opportunities citizens can verify.",
              },
              {
                for: "For Aspirants",
                title: "Make your vision visible.",
                body: "Share manifesto priorities and clearly labelled conceptual visualisations of proposed work.",
              },
              {
                for: "For Citizens",
                title: "Discover, engage and support.",
                body: "Explore leaders and projects, then continue engagement through WhatsApp with Faida.",
              },
            ].map((card) => (
              <div
                key={card.for}
                className="rounded-lg border border-border bg-surface p-6 transition-colors hover:border-border-strong"
              >
                <p className="meta-label text-accent">{card.for}</p>
                <h3 className="mt-3 text-h3 text-ink">{card.title}</h3>
                <p className="mt-3 text-small text-ink-muted">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai-gis" className="section-y border-t border-border bg-bg-elevated">
        <div className="container-wide">
          <SectionHeader
            eyebrow="Evidence layer"
            title="Powered by AI + GIS"
            description="Pair live project locations with carefully labelled conceptual simulations. AI never pretends to be completed infrastructure."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <figure className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="relative aspect-[16/11]">
                <Image
                  src="https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80"
                  alt="Existing road rehabilitation works in progress"
                  fill
                  className="object-cover"
                  sizes="(max-width:1024px) 100vw, 50vw"
                />
              </div>
              <figcaption className="space-y-3 p-5">
                <StatusBadge status="Existing project" tone="success" pulse />
                <h3 className="text-h3 text-ink">Satellite-backed project view</h3>
                <p className="text-small text-ink-muted">
                  Real works in Thika Town with mapped coordinates, progress and
                  milestone evidence citizens can inspect.
                </p>
              </figcaption>
            </figure>

            <figure className="overflow-hidden rounded-lg border border-border-accent bg-surface">
              <div className="relative aspect-[16/11]">
                <Image
                  src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&q=80"
                  alt="Conceptual AI-generated visualisation of a proposed urban development"
                  fill
                  className="object-cover"
                  sizes="(max-width:1024px) 100vw, 50vw"
                />
                <div className="absolute left-3 top-3">
                  <AiSimulationBadge />
                </div>
              </div>
              <figcaption className="space-y-3 p-5">
                <h3 className="text-h3 text-ink">AI-generated conceptual visualisation</h3>
                <p className="text-small text-ink-muted">
                  Proposed vision only — labelled as an AI simulation. Not a
                  completed real-world project.
                </p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="section-y border-t border-border">
        <div className="container-wide">
          <SectionHeader
            title="Explore development around you."
            description="Browse active and completed projects with status, location and progress in one place."
            action={
              <Button href="/projects" variant="outline">
                View all projects
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </div>
      </section>

      <section className="section-y border-t border-border bg-bg-elevated">
        <div className="container-wide">
          <SectionHeader
            title="Opportunities connected to development."
            description="Jobs, tenders, training and funding windows linked to public programmes and communities."
            action={
              <Button href="/opportunities" variant="outline">
                Browse opportunities
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredOpps.map((opp) => (
              <OpportunityCard key={opp.id} opportunity={opp} />
            ))}
          </div>
        </div>
      </section>

      <section id="faida" className="section-y border-t border-border">
        <div className="container-wide">
          <FaidaBanner />
        </div>
      </section>
    </>
  );
}
