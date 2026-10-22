"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { PollCard } from "@/components/cards/PollCard";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { useContent } from "@/components/content/ContentProvider";
import { usePollVotes } from "@/components/polls/usePollVotes";

export default function LeaderPollsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getPollsByIds } = useContent();
  const leader = ready ? getLeaderBySlug(slug) : undefined;
  const items = leader ? getPollsByIds(leader.pollIds) : [];
  const voteFor = usePollVotes(items);
  if (!ready) return <LoadingState />;
  if (!leader) notFound();

  return (
    <>
      <ProfileHeader leader={leader} activeTab="polls" />
      <section className="container-wide section-y-sm">
        {items.length === 0 ? (
          <EmptyState title="No polls yet" description="Community polls will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((poll) => (
              <PollCard key={poll.id} poll={poll} vote={voteFor(poll)} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
