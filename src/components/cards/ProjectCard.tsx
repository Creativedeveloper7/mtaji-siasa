import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { Project, ProjectStatus } from "@/types";
import { SafeImage } from "@/components/ui/SafeImage";
import { PROJECT_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/constants";
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

const SECTORS: [RegExp, string][] = [
  [/water|sanitation|borehole/i, "Water"],
  [/health|hospital|clinic/i, "Healthcare"],
  [/school|education|classroom/i, "Education"],
  [/youth|training|skills|agribusiness/i, "Youth"],
  [/road|bridge|market|infrastructure|housing/i, "Infrastructure"],
];

function projectSector(project: Project) {
  const source = `${project.subcategory} ${project.name}`;
  return (
    SECTORS.find(([pattern]) => pattern.test(source))?.[1] ??
    PROJECT_CATEGORY_LABELS[project.category]
  );
}

export function ProjectCard({ project }: ProjectCardProps) {
  const progress = Math.max(0, Math.min(100, project.progress));

  return (
    <article className="group flex h-full flex-col overflow-hidden border border-border bg-surface transition-colors duration-base hover:border-border-strong">
      <Link href={`/projects/${project.slug}`} className="flex h-full flex-col">
        <div className="relative aspect-[16/9] overflow-hidden bg-bg-elevated">
          <SafeImage
            src={project.image}
            alt={`Illustrative image for ${project.name}`}
            fill
            className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 90vw, 33vw"
          />
          <span aria-hidden className="image-label absolute bottom-3 left-3">
            Illustrative image
          </span>
        </div>
        <div className="flex flex-1 flex-col px-6 pb-6 pt-6">
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.11em]">
            <span className="truncate text-brand-green">{projectSector(project)}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-ink-muted">
              <span
                className={cn("h-1.5 w-1.5 rounded-full", statusDot[project.status])}
                aria-hidden
              />
              {PROJECT_STATUS_LABELS[project.status]}
            </span>
          </div>
          <h3 className="mt-3 text-[1.3rem] font-extrabold leading-snug text-ink">
            {project.name}
          </h3>
          <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {project.location}
          </p>
          <div className="mt-auto pt-6">
            <div className="flex items-center justify-between text-caption">
              <span className="text-ink-muted">Progress</span>
              <span className="text-small font-bold text-ink">{progress}%</span>
            </div>
            <div
              className="mt-2 h-1 overflow-hidden bg-border"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-accent transition-[width] duration-slow ease-premium"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-caption font-bold text-ink">
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
