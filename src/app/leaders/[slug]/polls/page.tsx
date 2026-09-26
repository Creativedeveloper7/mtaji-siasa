"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { PollCard } from "@/components/cards/PollCard";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { useContent } from "@/components/content/ContentProvider";

export default function LeaderPollsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getPollsByIds } = useContent();
  if (!ready) return <LoadingState />;
  const leader = getLeaderBySlug(slug);
  if (!leader) notFound();
  const items = getPollsByIds(leader.pollIds);

  return (
    <>
      <ProfileHeader leader={leader} activeTab="polls" />
      <section className="container-wide section-y-sm">
        {items.length === 0 ? (
          <EmptyState title="No polls yet" description="Community polls will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
