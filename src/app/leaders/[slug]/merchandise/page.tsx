"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ProfileHeader } from "@/components/leader/ProfileHeader";
import { ProductCard } from "@/components/cards/ProductCard";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { FaidaCTA } from "@/components/faida/FaidaCTA";
import { useContent } from "@/components/content/ContentProvider";

export default function LeaderMerchandisePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, getLeaderBySlug, getProductsByLeader } = useContent();
  if (!ready) return <LoadingState />;
  const leader = getLeaderBySlug(slug);
  if (!leader) notFound();
  const items = getProductsByLeader(leader.id);
  const displayName = `${leader.honorific} ${leader.name}`;

  return (
    <>
      <ProfileHeader leader={leader} activeTab="merchandise" />
      <section className="container-wide section-y-sm space-y-10">
        {items.length === 0 ? (
          <EmptyState
            title="No merchandise"
            description="Products linked to this profile will appear here."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  leaderName={displayName}
                />
              ))}
            </div>
            <div className="rounded-lg border border-border bg-surface p-6">
              <p className="text-small text-ink-muted">
                Merchandise requests are fulfilled through Faida on WhatsApp —
                keeping engagement in one conversational layer.
              </p>
              <div className="mt-4 max-w-xs">
                <FaidaCTA
                  intent="connect"
                  contextLabel={`Merchandise · ${displayName}`}
                  label="Request via Faida"
                />
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
