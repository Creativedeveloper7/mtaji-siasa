import type { Project } from "@/types";

/** The project's owner auth user id, carried by Tracker records (changemakers.user_id). */
export function projectOwnerUserId(project: Project): string | undefined {
  const value = (project as Project & { ownerUserId?: unknown }).ownerUserId;
  return typeof value === "string" && value ? value : undefined;
}

export interface OwnedProjectsInput {
  projects: Project[];
  isAdmin: boolean;
  /** Signed-in auth user id ("" or undefined when signed out). */
  userId?: string;
  /** Leader.projectIds of the user's profile (memory mode ownership). */
  leaderProjectIds?: string[];
  /** The Tracker backend is in use. */
  tracker: boolean;
}

/**
 * Projects the user may pick in the Adly studio.
 *
 * - Admins: every project.
 * - Tracker: only projects the user owns (ownerUserId). Leader.projectIds is
 *   not used there: it includes political_figures.commissioned_projects, which
 *   a leader can write on their own row (docs/tracker-backend.md, Adly).
 * - Memory: the projects on the user's leader profile.
 */
export function ownedProjects({ projects, isAdmin, userId, leaderProjectIds, tracker }: OwnedProjectsInput): Project[] {
  if (isAdmin) return projects;
  if (tracker || projects.some((project) => projectOwnerUserId(project))) {
    if (!userId) return [];
    return projects.filter((project) => projectOwnerUserId(project) === userId);
  }
  const ids = new Set(leaderProjectIds ?? []);
  return projects.filter((project) => ids.has(project.id));
}
