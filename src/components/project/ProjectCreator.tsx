"use client";

import Link from "next/link";
import { useContent } from "@/components/content/ContentProvider";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

function initials(name: string): string {
  const words = name
    .replace(/^(hon\.?|h\.e\.?|dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return (words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "");
}

/**
 * "Led by" line for a project: the creator's round profile photo and name.
 * The creator is leaderIds[0] (the owner's leader profile); owners without
 * one fall back to the Tracker changemaker name with an initials avatar.
 */
export function ProjectCreator({
  project,
  size = "sm",
  link = false,
  className,
}: {
  project: Project;
  size?: "sm" | "md";
  /** Link to the leader's public page. Off inside cards, which are already one big link. */
  link?: boolean;
  className?: string;
}) {
  const { content } = useContent();
  const leader = content.leaders.find((item) => item.id === project.leaderIds[0]);
  const name = leader ? `${leader.honorific} ${leader.name}`.trim() : project.creatorName?.trim();
  if (!name) return null;
  const photo = leader?.photo;
  const avatar = size === "md" ? "h-10 w-10 text-small" : "h-7 w-7 text-[11px]";

  const body = (
    <>
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-muted font-bold uppercase text-accent ring-2 ring-bg",
          avatar
        )}
        aria-hidden
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          initials(name)
        )}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">Led by</span>
        <span className={cn("block truncate font-semibold text-ink transition-colors group-hover/creator:text-accent", size === "md" ? "text-body" : "text-caption")}>
          {name}
        </span>
      </span>
    </>
  );

  const classes = cn("flex min-w-0 items-center gap-2.5", className);
  if (link && leader) {
    return (
      <Link href={`/leaders/${leader.slug}`} className={cn(classes, "group/creator w-fit")}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
