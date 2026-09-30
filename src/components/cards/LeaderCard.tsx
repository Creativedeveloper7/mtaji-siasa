import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { Leader } from "@/types";
import { SafeImage } from "@/components/ui/SafeImage";
import { cn, pluralize } from "@/lib/utils";

interface LeaderCardProps {
  leader: Leader;
}

export function LeaderCard({ leader }: LeaderCardProps) {
  const displayName = `${leader.honorific} ${leader.name}`;
  const projectCount = leader.projectIds.length;
  const isAspirant = leader.type === "aspirant";

  return (
    <article className="group flex h-full flex-col overflow-hidden border border-border bg-surface transition-colors duration-base hover:border-border-strong">
      <Link href={`/leaders/${leader.slug}`} className="flex h-full flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-bg-elevated">
          <SafeImage
            src={leader.photo}
            alt={`Portrait of ${displayName}`}
            fill
            className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 90vw, 33vw"
          />
          <span className="image-label absolute bottom-3 left-3">
            {isAspirant ? "Aspirant" : "Elected leader"}
          </span>
        </div>
        <div className="flex flex-1 flex-col px-6 pb-6 pt-6">
          <p
            className={cn(
              "text-[10px] font-bold uppercase tracking-[0.11em]",
              isAspirant ? "text-accent" : "text-brand-green"
            )}
          >
            {leader.position}
          </p>
          <h3 className="mt-3 text-[1.3rem] font-extrabold leading-snug text-ink">
            {displayName}
          </h3>
          <p className="mt-2 flex items-center gap-1.5 text-caption text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {leader.county} County
          </p>
          <p className="mt-4 line-clamp-2 flex-1 text-small leading-relaxed text-ink-muted">
            {leader.shortBio}
          </p>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4 text-caption font-bold text-ink">
            <span className="transition-colors group-hover:text-accent">View profile</span>
            <span className="inline-flex items-center gap-3">
              <span className="font-medium text-ink-muted">
                {projectCount} {pluralize(projectCount, "project")}
              </span>
              <ArrowUpRight
                className="h-4 w-4 transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
