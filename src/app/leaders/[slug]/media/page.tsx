"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { MediaCard } from "@/components/cards/MediaCard";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { useContent } from "@/components/content/ContentProvider";

export default function LeaderMediaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getMediaByIds } = useContent();
  if (!ready) return <LoadingState />;
  const leader = getLeaderBySlug(slug);
  if (!leader) notFound();
  const items = getMediaByIds(leader.mediaIds);

  return (
    <>
      <ProfileHeader leader={leader} activeTab="media" />
      <section className="container-wide section-y-sm">
        {items.length === 0 ? (
          <EmptyState title="No media yet" description="Updates and stories will appear here." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
