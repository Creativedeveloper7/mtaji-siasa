"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { useContent } from "@/components/content/ContentProvider";

export default function LeaderOpportunitiesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getOpportunitiesByIds } = useContent();
  if (!ready) return <LoadingState />;
  const leader = getLeaderBySlug(slug);
  if (!leader) notFound();
  const items = getOpportunitiesByIds(leader.opportunityIds);

  return (
    <>
      <ProfileHeader leader={leader} activeTab="opportunities" />
      <section className="container-wide section-y-sm space-y-10">
        {items.length === 0 ? (
          <EmptyState
            title="No opportunities yet"
            description="Opportunities linked to this leader will appear here."
          />
        ) : (
          <CardCarousel label="Opportunities">
            {items.map((o) => (
              <OpportunityCard key={o.id} opportunity={o} />
            ))}
          </CardCarousel>
        )}
        <FaidaBanner
          title="Want more opportunities?"
          body="Connect with Faida and receive relevant updates through WhatsApp."
          intent="opportunity"
        />
      </section>
    </>
  );
}
