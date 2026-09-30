import Link from "next/link";
import { ArrowUpRight, Bookmark, MapPin } from "lucide-react";
import type { Opportunity, OpportunityStatus } from "@/types";
import { OPPORTUNITY_CATEGORY_LABELS, OPPORTUNITY_STATUS_LABELS } from "@/lib/constants";
import { formatDate, cn } from "@/lib/utils";
import { resolveOpportunityStatus } from "@/lib/related-content";

interface OpportunityCardProps {
  opportunity: Opportunity;
  saved?: boolean;
  onToggleSave?: (id: string) => void;
}

const statusTone: Record<OpportunityStatus, string> = {
  open: "text-brand-green",
  "closing-soon": "text-warning",
  closed: "text-brand-red",
};

export function OpportunityCard({
  opportunity,
  saved = false,
  onToggleSave,
}: OpportunityCardProps) {
  const status = resolveOpportunityStatus(opportunity);
  const href = `/opportunities/${opportunity.slug}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden border border-border bg-surface transition-colors duration-base hover:border-border-strong">
      <Link href={href} className="flex flex-1 flex-col">
        {opportunity.image && (
          <div className="relative aspect-[16/9] overflow-hidden bg-bg-elevated">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={opportunity.image}
              alt={`Illustrative image for ${opportunity.title}`}
              className="h-full w-full object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
            />
            <span aria-hidden className="image-label absolute bottom-3 left-3">
              Illustrative image
            </span>
          </div>
        )}
        <div className="flex flex-1 flex-col px-6 pt-6">
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.11em]">
            <span className="text-brand-green">
              {OPPORTUNITY_CATEGORY_LABELS[opportunity.category]}
            </span>
            <span className={statusTone[status]}>
              {OPPORTUNITY_STATUS_LABELS[status]}
            </span>
          </div>
          <h3 className="mt-3 text-[1.3rem] font-extrabold leading-snug text-ink">
            {opportunity.title}
          </h3>
          <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {opportunity.location}
          </p>
          <p className="mt-3 line-clamp-3 text-caption text-ink-muted">
            <span className="font-semibold text-ink">Eligibility: </span>
            {opportunity.eligibility}
          </p>
          <div className="mt-auto flex items-center justify-between pt-5 text-caption">
            <span className="text-ink-muted">Deadline</span>
            <span className="font-bold text-ink">
              {formatDate(opportunity.deadline)}
            </span>
          </div>
        </div>
      </Link>
      <div className="mx-6 mt-4 flex items-center justify-between gap-3 border-t border-border py-4">
        <Link
          href={href}
          className="inline-flex items-center gap-2 text-caption font-bold text-ink transition-colors hover:text-accent"
        >
          View opportunity
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(opportunity.id)}
            aria-pressed={saved}
            aria-label={`${saved ? "Unsave" : "Save"} ${opportunity.title}`}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
              saved
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-border-strong text-ink-muted hover:border-accent/50 hover:text-accent"
            )}
          >
            <Bookmark className={cn("h-4 w-4", saved && "fill-current")} aria-hidden />
          </button>
        )}
      </div>
    </article>
  );
}
