"use client";

import { use, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Calendar, MapPin, Building2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { ShareButton } from "@/components/ui/ShareButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState, LoadingState } from "@/components/ui/EmptyState";
import { OpportunityCard } from "@/components/cards/OpportunityCard";
import { MediaCard } from "@/components/cards/MediaCard";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { FaidaBanner } from "@/components/faida/FaidaCTA";
import { CardCarousel } from "@/components/ui/CardCarousel";
import { useContent } from "@/components/content/ContentProvider";
import {
  OPPORTUNITY_CATEGORY_LABELS,
  OPPORTUNITY_STATUS_LABELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import {
  getRelatedLeader,
  getRelatedMedia,
  getRelatedOpportunities,
  getRelatedProject,
  opportunityDetailDefaults,
  resolveOpportunityStatus,
} from "@/lib/related-content";

function DetailSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border py-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <h2 className="text-h3 text-ink">{title}</h2>
        <span className="text-caption text-ink-subtle">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="mt-4 space-y-3 text-body text-ink-muted">{children}</div>}
    </section>
  );
}

export default function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { ready, content, getOpportunityBySlug } = useContent();

  const raw = getOpportunityBySlug(slug);
  const opportunity = raw ? opportunityDetailDefaults(raw) : undefined;

  const pool = useMemo(
    () => ({
      opportunities: content.opportunities,
      media: content.media,
      projects: content.projects,
      leaders: content.leaders,
    }),
    [content]
  );

  const relatedProject = useMemo(
    () => getRelatedProject(pool, opportunity?.projectId),
    [pool, opportunity?.projectId]
  );
  const relatedLeader = useMemo(
    () => getRelatedLeader(pool, opportunity?.leaderId),
    [pool, opportunity?.leaderId]
  );
  const relatedOpps = useMemo(
    () =>
      opportunity
        ? getRelatedOpportunities(pool, {
            id: opportunity.id,
            category: opportunity.category,
            county: opportunity.county,
            projectId: opportunity.projectId,
            leaderId: opportunity.leaderId,
          })
        : [],
    [pool, opportunity]
  );
  const relatedMedia = useMemo(
    () =>
      opportunity
        ? getRelatedMedia(pool, {
            id: opportunity.id,
            county: opportunity.county,
            projectId: opportunity.projectId,
            leaderId: opportunity.leaderId,
            relatedIds: opportunity.relatedMediaIds,
          })
        : [],
    [pool, opportunity]
  );

  if (!ready) return <LoadingState label="Loading opportunity…" />;
  if (!opportunity) {
    return (
      <section className="container-wide section-y">
        <EmptyState
          title="Opportunity not found"
          description="We couldn't find the opportunity you're looking for."
          action={
            <Button href="/opportunities" variant="outline">
              Explore Opportunities
            </Button>
          }
        />
      </section>
    );
  }

  const status = resolveOpportunityStatus(opportunity);
  const tone =
    status === "open"
      ? "success"
      : status === "closing-soon"
        ? "warning"
        : "error";
  const primaryLabel = opportunity.applicationUrl
    ? "Apply / Learn More"
    : "Get More Information";

  return (
    <>
      <section className="border-b border-border bg-bg-elevated">
        <div className="container-wide py-8 md:py-12">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Opportunities", href: "/opportunities" },
              {
                label: OPPORTUNITY_CATEGORY_LABELS[opportunity.category],
                href: "/opportunities",
              },
              { label: opportunity.title },
            ]}
          />
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="meta-label text-accent">
              {OPPORTUNITY_CATEGORY_LABELS[opportunity.category]}
            </span>
            <StatusBadge
              status={OPPORTUNITY_STATUS_LABELS[status]}
              tone={tone}
              pulse={status === "open"}
            />
          </div>
          <h1 className="mt-4 max-w-4xl text-h1 text-ink md:text-display">
            {opportunity.title}
          </h1>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-small text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {opportunity.location}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              Deadline {formatDate(opportunity.deadline)}
            </span>
            {opportunity.organization && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                {opportunity.organization}
              </span>
            )}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            {opportunity.applicationUrl ? (
              <Button href={opportunity.applicationUrl} size="lg">
                {primaryLabel}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  document.getElementById("how-to-apply")?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                {primaryLabel}
              </Button>
            )}
            <ShareButton title={opportunity.title} />
          </div>
        </div>
      </section>

      <section className="container-wide section-y-sm">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <DetailSection title="About this opportunity">
              <p>{opportunity.description}</p>
            </DetailSection>
            <DetailSection title="Who can apply">
              <p>{opportunity.eligibility}</p>
            </DetailSection>
            <DetailSection title="What you get">
              <ul className="list-disc space-y-2 pl-5">
                {(opportunity.benefits ?? []).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </DetailSection>
            <DetailSection title="Requirements">
              <ul className="list-disc space-y-2 pl-5">
                {(opportunity.requirements ?? []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </DetailSection>
            <div id="how-to-apply">
              <DetailSection title="How to apply">
                <ol className="list-decimal space-y-2 pl-5">
                  {(opportunity.applicationSteps ?? []).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </DetailSection>
            </div>
            <DetailSection title="Important dates">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="meta-label">Opening date</dt>
                  <dd className="mt-1 text-ink">
                    {formatDate(opportunity.openingDate || opportunity.deadline)}
                  </dd>
                </div>
                <div>
                  <dt className="meta-label">Closing date</dt>
                  <dd className="mt-1 text-ink">
                    {formatDate(opportunity.deadline)}
                  </dd>
                </div>
              </dl>
            </DetailSection>
            <DetailSection title="Contact / organization">
              <p>{opportunity.organization}</p>
              {relatedLeader && (
                <p className="mt-3">
                  Linked profile:{" "}
                  <Link
                    href={`/leaders/${relatedLeader.slug}`}
                    className="text-accent hover:text-accent-hover"
                  >
                    {relatedLeader.honorific} {relatedLeader.name}
                  </Link>
                </p>
              )}
            </DetailSection>
          </div>

          <aside className="h-fit rounded-lg border border-border bg-surface p-5 lg:sticky lg:top-24">
            <p className="meta-label text-accent">Key information</p>
            <dl className="mt-4 space-y-4 text-small">
              <div>
                <dt className="text-ink-subtle">Category</dt>
                <dd className="mt-1 text-ink">
                  {OPPORTUNITY_CATEGORY_LABELS[opportunity.category]}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Location</dt>
                <dd className="mt-1 text-ink">{opportunity.location}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Deadline</dt>
                <dd className="mt-1 text-ink">
                  {formatDate(opportunity.deadline)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Eligibility</dt>
                <dd className="mt-1 text-ink">{opportunity.eligibility}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Opportunity type</dt>
                <dd className="mt-1 text-ink">
                  {OPPORTUNITY_CATEGORY_LABELS[opportunity.category]}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Status</dt>
                <dd className="mt-2">
                  <StatusBadge
                    status={OPPORTUNITY_STATUS_LABELS[status]}
                    tone={tone}
                  />
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      {relatedProject && (
        <section className="border-t border-border bg-bg-elevated">
          <div className="container-wide section-y-sm">
            <h2 className="text-h2 text-ink">Related project</h2>
            <p className="mt-2 max-w-2xl text-small text-ink-muted">
              This opportunity is connected to a tracked development project.
            </p>
            <div className="mt-6 max-w-md">
              <ProjectCard project={relatedProject} />
            </div>
          </div>
        </section>
      )}

      {relatedOpps.length > 0 && (
        <section className="border-t border-border">
          <div className="container-wide section-y-sm">
            <h2 className="text-h2 text-ink">Related opportunities</h2>
            <CardCarousel
              label="Related opportunities"
              gridClassName="md:grid-cols-2 lg:grid-cols-4"
              className="mt-6"
            >
              {relatedOpps.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} />
              ))}
            </CardCarousel>
          </div>
        </section>
      )}

      {relatedMedia.length > 0 && (
        <section className="border-t border-border bg-bg-elevated">
          <div className="container-wide section-y-sm">
            <h2 className="text-h2 text-ink">Related stories</h2>
            <CardCarousel
              label="Related stories"
              gridClassName="md:grid-cols-2 lg:grid-cols-4"
              className="mt-6"
            >
              {relatedMedia.map((m) => (
                <MediaCard key={m.id} item={m} />
              ))}
            </CardCarousel>
          </div>
        </section>
      )}

      <section className="container-wide section-y-sm">
        <FaidaBanner
          title="Want more opportunities like this?"
          body="Connect with Faida by M-Taji through WhatsApp and stay updated on relevant opportunities."
          intent="opportunity"
        />
      </section>
    </>
  );
}
