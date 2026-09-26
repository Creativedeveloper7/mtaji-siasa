import Link from "next/link";
import type { Project } from "@/types";
import { StatusBadge, statusToneForProject } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SafeImage } from "@/components/ui/SafeImage";
import { PROJECT_STATUS_LABELS, PROJECT_CATEGORY_LABELS } from "@/lib/constants";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-fast hover:border-border-strong">
      <Link href={`/projects/${project.slug}`} className="flex h-full flex-col">
        <div className="relative aspect-[16/10] overflow-hidden bg-bg-elevated">
          <SafeImage
            src={project.image}
            alt={project.name}
            fill
            className="object-cover transition-transform duration-slow ease-premium group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          <div className="absolute left-3 top-3">
            <StatusBadge
              status={PROJECT_STATUS_LABELS[project.status]}
              tone={statusToneForProject(project.status)}
              pulse={project.status === "in-progress"}
            />
          </div>
        </div>
        <div className="flex flex-1 flex-col p-5">
          <p className="meta-label">{PROJECT_CATEGORY_LABELS[project.category]}</p>
          <h3 className="mt-2 text-h3 text-ink group-hover:text-accent transition-colors duration-fast">
            {project.name}
          </h3>
          <p className="mt-2 text-small text-ink-muted">{project.location}</p>
          <div className="mt-auto pt-5">
            <ProgressBar value={project.progress} size="sm" />
          </div>
          <span className="mt-4 text-small text-accent">View Project →</span>
        </div>
      </Link>
    </article>
  );
}
