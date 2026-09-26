import Link from "next/link";
import type { Leader } from "@/types";
import { Button } from "@/components/ui/Button";
import { SafeImage } from "@/components/ui/SafeImage";
import { pluralize } from "@/lib/utils";

interface LeaderCardProps {
  leader: Leader;
}

export function LeaderCard({ leader }: LeaderCardProps) {
  const displayName = `${leader.honorific} ${leader.name}`;
  const projectCount = leader.projectIds.length;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-fast hover:border-border-strong">
      <div className="relative aspect-[4/3] overflow-hidden bg-bg-elevated">
        <SafeImage
          src={leader.photo}
          alt={`Portrait of ${displayName}`}
          fill
          className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg/80 to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-sm border border-border bg-bg/80 px-2 py-1 text-meta uppercase tracking-[0.06em] text-ink-muted backdrop-blur-sm">
          {leader.type === "aspirant" ? "Aspirant" : "Elected"}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-h3 text-ink">{displayName}</h3>
        <p className="mt-1 text-small text-ink-muted">{leader.position}</p>
        <p className="mt-1 text-caption text-ink-subtle">{leader.county} County</p>
        <p className="mt-4 line-clamp-2 flex-1 text-small text-ink-muted">
          {leader.shortBio}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="font-mono text-caption text-ink-subtle">
            {projectCount} {pluralize(projectCount, "project")}
          </span>
          <Button href={`/leaders/${leader.slug}`} size="sm" variant="outline">
            View Profile
          </Button>
        </div>
      </div>
    </article>
  );
}
