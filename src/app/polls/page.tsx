"use client";

import { PollCard } from "@/components/cards/PollCard";
import { PageHeader } from "@/components/project/ProjectHero";
import { useContent } from "@/components/content/ContentProvider";
import { LoadingState } from "@/components/ui/EmptyState";

export default function PollsPage() {
  const { content, ready } = useContent();
  if (!ready) return <LoadingState />;

  return (
    <>
      <PageHeader
        title="Community Polls"
        description="Neutral, simple questions that help surface what communities care about."
      />
      <section className="container-wide section-y-sm">
        <div className="grid gap-4 md:grid-cols-2">
          {content.polls.map((poll) => (
            <PollCard key={poll.id} poll={poll} />
          ))}
        </div>
      </section>
    </>
  );
}
