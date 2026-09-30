import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { Project, ProjectStatus } from "@/types";
import { SafeImage } from "@/components/ui/SafeImage";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
}

const statusDot: Record<ProjectStatus, string> = {
  "in-progress": "bg-brand-green",
  completed: "bg-accent",
  planned: "bg-ink-subtle",
  "on-hold": "bg-brand-red",
};

export function ProjectCard({ project }: ProjectCardProps) {
  const progress = Math.max(0, Math.min(100, project.progress));

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface shadow-soft transition-shadow duration-base hover:shadow-raised">
      <Link href={`/projects/${project.slug}`} className="flex h-full flex-col">
        <div className="relative aspect-[16/9] overflow-hidden bg-bg-elevated">
          <SafeImage
            src={project.image}
            alt={project.name}
            fill
            className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 90vw, 33vw"
          />
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-brand-green">
              {project.subcategory}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink">
              <span
                className={cn("h-1.5 w-1.5 rounded-full", statusDot[project.status])}
                aria-hidden
              />
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>
          <h3 className="mt-3 text-[1.15rem] font-bold leading-snug text-ink">
            {project.name}
          </h3>
          <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {project.location}
          </p>
          <div className="mt-auto pt-6">
            <div className="flex items-center justify-between text-caption">
              <span className="text-ink-muted">Progress</span>
              <span className="font-bold text-ink">{progress}%</span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden rounded-full bg-border-strong"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-slow ease-premium"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-small font-bold text-ink">
            <span className="transition-colors group-hover:text-accent">
              View project
            </span>
            <ArrowUpRight
              className="h-4 w-4 transition-transform duration-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        </div>
      </Link>
    </article>
  );
}
