import type { ProjectMilestone } from "@/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SafeImage } from "@/components/ui/SafeImage";
import { formatDate } from "@/lib/utils";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";

interface MilestoneTimelineProps {
  milestones: ProjectMilestone[];
}

function tone(status: ProjectMilestone["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "current") return "accent" as const;
  return "neutral" as const;
}

function label(status: ProjectMilestone["status"]) {
  if (status === "completed") return "Completed";
  if (status === "current") return "Current";
  return "Upcoming";
}

export function MilestoneTimeline({ milestones }: MilestoneTimelineProps) {
  return (
    <div>
      <div className="mb-6 hidden items-center gap-2 md:flex">
        {milestones.map((m, i) => (
          <div key={m.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-caption font-mono ${
                m.status === "upcoming"
                  ? "border-border text-ink-subtle"
                  : "border-accent/40 bg-accent-soft text-accent"
              }`}
            >
              {String(m.number).padStart(2, "0")}
            </span>
            {i < milestones.length - 1 && (
              <span
                className={`h-px flex-1 ${
                  m.status === "completed" ? "bg-accent/50" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <HorizontalScroller label="Project milestones" showControls>
        {milestones.map((m) => (
          <MilestoneCard key={m.id} milestone={m} />
        ))}
      </HorizontalScroller>
    </div>
  );
}

export function MilestoneCard({
  milestone,
}: {
  milestone: ProjectMilestone;
}) {
  return (
    <article className="flex w-[280px] flex-col overflow-hidden rounded-lg border border-border bg-surface md:w-[300px]">
      {milestone.image && (
        <div className="relative aspect-[16/10]">
          <SafeImage
            src={milestone.image}
            alt=""
            fill
            className="object-cover"
            sizes="300px"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-caption text-accent">
            {String(milestone.number).padStart(2, "0")}
          </span>
          <StatusBadge
            status={label(milestone.status)}
            tone={tone(milestone.status)}
            pulse={milestone.status === "current"}
          />
        </div>
        <p className="mt-3 text-caption text-ink-subtle">
          {formatDate(milestone.date)}
        </p>
        <h3 className="mt-1 text-h3 text-ink">{milestone.title}</h3>
        <p className="mt-3 text-small text-ink-muted">{milestone.description}</p>
      </div>
    </article>
  );
}
