"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { Button } from "@/components/ui/Button";
import { FaidaCTA } from "@/components/faida/FaidaCTA";
import { useContent } from "@/components/content/ContentProvider";
import { LoadingState } from "@/components/ui/EmptyState";

export default function LeaderProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getProjectsByIds, getOpportunitiesByIds } =
    useContent();

  if (!ready) return <LoadingState />;

  const leader = getLeaderBySlug(slug);
  if (!leader) notFound();

  const leaderProjects = getProjectsByIds(leader.projectIds).slice(0, 3);
  const leaderOpps = getOpportunitiesByIds(leader.opportunityIds).slice(0, 2);
  const displayName = `${leader.honorific} ${leader.name}`;

  return (
    <>
      <ProfileHeader leader={leader} activeTab="overview" />

      <section className="container-wide section-y-sm space-y-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr]">
          <div>
            <h2 className="text-h2 text-ink">About</h2>
            <p className="mt-4 text-body text-ink-muted">{leader.bio}</p>
          </div>
          <aside className="rounded-lg border border-border bg-surface p-5">
            <p className="meta-label">Engage</p>
            <p className="mt-3 text-small text-ink-muted">
              Support, volunteer or join the movement through Faida on WhatsApp.
            </p>
            <div className="mt-5">
              <FaidaCTA
                intent="support"
                contextLabel={displayName}
                label="Support via Faida"
                fullWidth
              />
            </div>
          </aside>
        </div>

        <div>
          <h2 className="text-h2 text-ink">Achievements</h2>
          <ul className="mt-6 space-y-3">
            {leader.achievements.map((item) => (
              <li
                key={item}
                className="flex gap-3 border-b border-border pb-3 text-small text-ink-muted last:border-0"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {leader.vision && (
          <div className="rounded-lg border border-border-accent bg-accent-soft p-6 md:p-8">
            <p className="meta-label text-accent">Aspirant vision</p>
            <p className="mt-3 max-w-3xl text-body text-ink">
              {leader.vision.statement}
            </p>
            <Button href={`/leaders/${leader.slug}/vision`} className="mt-6" variant="outline">
              View full vision
            </Button>
          </div>
        )}

        <div>
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 className="text-h2 text-ink">Projects</h2>
            <Link
              href={`/leaders/${leader.slug}/projects`}
              className="text-small text-accent hover:text-accent-hover"
            >
              View all
            </Link>
          </div>
          {leaderProjects.length === 0 ? (
            <p className="text-small text-ink-muted">
              No published projects yet.
              {leader.vision && " Explore proposed vision projects instead."}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {leaderProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>

        {leaderOpps.length > 0 && (
          <div>
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="text-h2 text-ink">Opportunities</h2>
              <Link
                href={`/leaders/${leader.slug}/opportunities`}
                className="text-small text-accent hover:text-accent-hover"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {leaderOpps.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} />
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
