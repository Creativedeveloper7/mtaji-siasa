import type { ReactNode } from "react";
import { StatusBadge, statusToneForProject } from "@/components/ui/StatusBadge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ShareButton } from "@/components/ui/ShareButton";
import { SafeImage } from "@/components/ui/SafeImage";
import { PROJECT_CATEGORY_LABELS, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { Project } from "@/types";

interface ProjectHeroProps {
  project: Project;
}

export function ProjectHero({ project }: ProjectHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="relative h-[280px] md:h-[420px]">
        <SafeImage
          src={project.image}
          alt={project.name}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-bg/10" />
      </div>
      <div className="container-wide relative -mt-28 pb-10 md:-mt-36 md:pb-14">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={PROJECT_STATUS_LABELS[project.status]}
            tone={statusToneForProject(project.status)}
            pulse={project.status === "in-progress"}
          />
          <span className="meta-label">
            {PROJECT_CATEGORY_LABELS[project.category]}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-h1 text-ink md:text-display">{project.name}</h1>
            <p className="mt-3 text-body text-ink-muted">{project.location}</p>
          </div>
          <ShareButton title={project.name} />
        </div>
        <div className="mt-8 max-w-md">
          <ProgressBar value={project.progress} />
        </div>
      </div>
    </section>
  );
}

export function ProjectStats({ project }: { project: Project }) {
  const items = [
    { label: "Project type", value: project.subcategory },
    { label: "Location", value: project.location },
    { label: "Status", value: PROJECT_STATUS_LABELS[project.status] },
    { label: "Start date", value: formatDate(project.startDate) },
    { label: "Expected completion", value: formatDate(project.expectedCompletion) },
    { label: "Progress", value: `${project.progress}%` },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-surface px-4 py-4"
        >
          <p className="meta-label">{item.label}</p>
          <p className="mt-2 text-small text-ink">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function AiSimulationBadge() {
  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge status="AI Simulation" tone="warning" />
      <StatusBadge status="Proposed Vision" tone="accent" />
      <StatusBadge status="Conceptual Visualization" tone="neutral" />
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="meta-label text-accent">{eyebrow}</p>}
        <h2 className={`text-h2 text-ink ${eyebrow ? "mt-3" : ""}`}>{title}</h2>
        {description && (
          <p className="mt-3 text-body text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="container-wide py-10 md:py-14">
        <h1 className="text-h1 text-ink">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-body text-ink-muted">{description}</p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </div>
  );
}
