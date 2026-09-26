import Link from "next/link";
import type { Opportunity } from "@/types";
import { OPPORTUNITY_CATEGORY_LABELS, OPPORTUNITY_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { MapPin, Calendar } from "lucide-react";
import { resolveOpportunityStatus } from "@/lib/related-content";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface OpportunityCardProps {
  opportunity: Opportunity;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const status = resolveOpportunityStatus(opportunity);
  const tone =
    status === "open"
      ? "success"
      : status === "closing-soon"
        ? "warning"
        : "neutral";

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-fast hover:border-border-strong hover:bg-surface-hover">
      <Link
        href={`/opportunities/${opportunity.slug}`}
        className="flex h-full flex-col"
      >
        {opportunity.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={opportunity.image}
            alt=""
            className="aspect-[16/10] w-full object-cover"
          />
        )}
        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-label text-accent">
              {OPPORTUNITY_CATEGORY_LABELS[opportunity.category]}
            </span>
            <StatusBadge
              status={OPPORTUNITY_STATUS_LABELS[status]}
              tone={tone}
            />
          </div>
          <h3 className="mt-3 text-h3 text-ink">{opportunity.title}</h3>
          <div className="mt-4 space-y-2 text-small text-ink-muted">
            <p className="flex items-start gap-2">
              <MapPin
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle"
                aria-hidden
              />
              {opportunity.location}
            </p>
            <p className="flex items-start gap-2">
              <Calendar
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle"
                aria-hidden
              />
              Deadline {formatDate(opportunity.deadline)}
            </p>
          </div>
          <p className="mt-4 line-clamp-2 flex-1 text-small text-ink-subtle">
            <span className="text-ink-muted">Eligibility: </span>
            {opportunity.eligibility}
          </p>
          <span className="mt-5 inline-flex text-small text-accent transition-colors group-hover:text-accent-hover">
            View Opportunity →
          </span>
        </div>
      </Link>
    </article>
  );
}
