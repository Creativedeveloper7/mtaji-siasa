"use client";

import { useState } from "react";
import type { Leader } from "@/types";
import { Button } from "@/components/ui/Button";
import { SocialLinks } from "@/components/ui/SocialLinks";
import { ShareButton } from "@/components/ui/ShareButton";
import { SupportModal } from "@/components/engagement/SupportModal";
import { Tabs } from "@/components/ui/Tabs";
import { SafeImage } from "@/components/ui/SafeImage";
import { LEADER_TYPE_LABELS } from "@/lib/constants";

interface ProfileHeaderProps {
  leader: Leader;
  activeTab: string;
}

export function ProfileHeader({ leader, activeTab }: ProfileHeaderProps) {
  const [supportOpen, setSupportOpen] = useState(false);
  const displayName = `${leader.honorific} ${leader.name}`;
  const base = `/leaders/${leader.slug}`;

  const tabs = [
    { id: "overview", label: "Overview", href: base },
    { id: "projects", label: "Projects", href: `${base}/projects` },
    { id: "opportunities", label: "Opportunities", href: `${base}/opportunities` },
    { id: "media", label: "Media", href: `${base}/media` },
    { id: "polls", label: "Polls", href: `${base}/polls` },
    { id: "merchandise", label: "Merchandise", href: `${base}/merchandise` },
  ];

  if (leader.vision) {
    tabs.splice(1, 0, {
      id: "vision",
      label: "Vision",
      href: `${base}/vision`,
    });
  }

  return (
    <>
      <section className="border-b border-border">
        <div className="relative h-40 bg-bg-elevated md:h-56">
          {leader.coverImage && (
            <SafeImage
              src={leader.coverImage}
              alt=""
              fill
              className="object-cover opacity-50"
              sizes="100vw"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg to-transparent" />
        </div>

        <div className="container-wide pb-0">
          <div className="relative -mt-16 flex flex-col gap-6 md:-mt-20 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-surface md:h-36 md:w-36">
                <SafeImage
                  src={leader.photo}
                  alt={`Portrait of ${displayName}`}
                  fill
                  className="object-cover"
                  sizes="144px"
                  priority
                />
              </div>
              <div className="pb-1">
                <p className="meta-label">{LEADER_TYPE_LABELS[leader.type]}</p>
                <h1 className="mt-1 text-h1 text-ink">{displayName}</h1>
                <p className="mt-2 text-body text-ink-muted">{leader.position}</p>
                <p className="mt-1 text-small text-ink-subtle">
                  {leader.county} County
                  {leader.constituency ? ` · ${leader.constituency}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Button type="button" onClick={() => setSupportOpen(true)}>
                Support
              </Button>
              <ShareButton title={displayName} />
            </div>
          </div>

          <div className="mt-8">
            <SocialLinks links={leader.social} />
          </div>

          <div className="mt-8">
            <Tabs items={tabs} activeId={activeTab} />
          </div>
        </div>
      </section>

      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        leaderName={displayName}
      />
    </>
  );
}
