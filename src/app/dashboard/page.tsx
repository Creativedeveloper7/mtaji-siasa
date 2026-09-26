"use client";

import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminUI";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useContent } from "@/components/content/ContentProvider";
import { Button } from "@/components/ui/Button";
import { FaidaCTA } from "@/components/faida/FaidaCTA";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusBadge, statusToneForProject } from "@/components/ui/StatusBadge";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";

export default function PoliticianOverviewPage() {
  const { leader, isAspirant } = usePoliticianProfile();
  const {
    getProjectsByIds,
    getOpportunitiesByIds,
    getMediaByIds,
    getPollsByIds,
    getProductsByLeader,
  } = useContent();

  if (!leader) return null;

  const projects = getProjectsByIds(leader.projectIds);
  const opportunities = getOpportunitiesByIds(leader.opportunityIds);
  const media = getMediaByIds(leader.mediaIds);
  const polls = getPollsByIds(leader.pollIds);
  const products = getProductsByLeader(leader.id);

  const cards = [
    { label: "Projects", value: projects.length, href: "/dashboard/projects" },
    {
      label: "Opportunities",
      value: opportunities.length,
      href: "/dashboard/opportunities",
    },
    { label: "Media", value: media.length, href: "/dashboard/media" },
    { label: "Polls", value: polls.length, href: "/dashboard/polls" },
    {
      label: "Merchandise",
      value: products.length,
      href: "/dashboard/merchandise",
    },
  ];

  return (
    <div className="space-y-10">
      <AdminHeader
        title="Your workspace"
        description="Control everything citizens see about you — profile, projects, GIS evidence, media, opportunities and engagement."
        action={
          <Button href={`/leaders/${leader.slug}`} variant="outline">
            View public profile
          </Button>
        }
      />

      <section className="rounded-lg border border-border bg-surface p-6">
        <p className="meta-label text-accent">
          {isAspirant ? "Aspirant" : "Elected leader"}
        </p>
        <h2 className="mt-2 text-h2 text-ink">
          {leader.honorific} {leader.name}
        </h2>
        <p className="mt-2 text-small text-ink-muted">{leader.position}</p>
        <p className="mt-1 text-caption text-ink-subtle">
          {leader.county} County
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button href="/dashboard/profile" size="sm">
            Edit profile
          </Button>
          <Button href="/dashboard/projects" size="sm" variant="outline">
            Manage projects
          </Button>
          {isAspirant && (
            <Button href="/dashboard/vision" size="sm" variant="outline">
              Edit vision
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
          >
            <p className="meta-label">{card.label}</p>
            <p className="mt-3 font-mono text-h2 text-accent">{card.value}</p>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h3 className="text-h3 text-ink">Recent projects</h3>
          <Link
            href="/dashboard/projects"
            className="text-small text-accent hover:text-accent-hover"
          >
            Manage all
          </Link>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-small text-ink-muted">
            No projects yet. Publish your first development project with location
            and milestones.
          </p>
        ) : (
          <ul className="space-y-3">
            {projects.slice(0, 4).map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-small font-medium text-ink">{p.name}</p>
                    <p className="mt-1 text-caption text-ink-subtle">
                      {p.location}
                    </p>
                  </div>
                  <StatusBadge
                    status={PROJECT_STATUS_LABELS[p.status]}
                    tone={statusToneForProject(p.status)}
                  />
                </div>
                <div className="mt-4 max-w-sm">
                  <ProgressBar value={p.progress} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border-accent bg-accent-soft p-6">
        <p className="meta-label text-accent">Citizen engagement</p>
        <h3 className="mt-2 text-h3 text-ink">Stay connected through Faida</h3>
        <p className="mt-2 max-w-xl text-small text-ink-muted">
          Supporters, volunteers and donors continue through WhatsApp via Faida —
          the conversational layer outside this visual dashboard.
        </p>
        <div className="mt-5 max-w-xs">
          <FaidaCTA
            intent="updates"
            contextLabel={`${leader.honorific} ${leader.name}`}
            label="Open Faida tools"
          />
        </div>
      </section>
    </div>
  );
}
