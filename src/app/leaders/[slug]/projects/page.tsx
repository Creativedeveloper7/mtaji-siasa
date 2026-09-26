"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useContent } from "@/components/content/ContentProvider";

export default function LeaderProjectsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getProjectsByIds } = useContent();
  if (!ready) return <LoadingState />;
  const leader = getLeaderBySlug(slug);
  if (!leader) notFound();
  const items = getProjectsByIds(leader.projectIds);

  return (
    <>
      <ProfileHeader leader={leader} activeTab="projects" />
      <section className="container-wide section-y-sm">
        {items.length === 0 ? (
          <EmptyState
            title="No projects published"
            description={
              leader.vision
                ? "This aspirant has proposed vision projects instead."
                : "Projects will appear here when published."
            }
            action={
              leader.vision ? (
                <Button href={`/leaders/${leader.slug}/vision`} variant="outline">
                  View vision
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
