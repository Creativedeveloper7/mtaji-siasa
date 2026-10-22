"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useContent } from "@/components/content/ContentProvider";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import { useAdly } from "@/components/adly/AdlyProvider";
import { ownedProjects } from "@/components/adly/owned-projects";
import type { Leader, Project } from "@/types";

/**
 * Leaders / projects the signed-in user may act on in Adly.
 * Politicians only see their own linked profile; admins see everyone.
 * On the Tracker, projects are only those the user owns (not commissioned
 * ones); see ownedProjects. Must be used inside AdlyProvider.
 */
export function useOwnedLeaderScope() {
  const { user } = useAuth();
  const { content, ready: contentReady } = useContent();
  const { leader, account, ready: profileReady } = usePoliticianProfile();
  const { backend } = useAdly();
  const isAdmin = user?.role === "admin";

  const leaders = useMemo(() => {
    if (isAdmin) return content.leaders;
    if (leader) return [leader];
    const id = account?.leaderId || user?.leaderId;
    if (!id) return [];
    const match = content.leaders.find((l) => l.id === id);
    return match ? [match] : [];
  }, [isAdmin, leader, account?.leaderId, user?.leaderId, content.leaders]);

  const primary = leaders[0];

  const projects = useMemo(
    () =>
      ownedProjects({
        projects: content.projects,
        isAdmin,
        userId: user?.userId,
        leaderProjectIds: primary?.projectIds,
        tracker: backend === "tracker",
      }),
    [isAdmin, user?.userId, primary?.projectIds, backend, content.projects]
  );

  return {
    ready: contentReady && profileReady,
    isAdmin,
    leaders,
    leader: primary as Leader | undefined,
    leaderId: primary?.id || "",
    projects: projects as Project[],
    ownedProjectIds: projects.map((p) => p.id),
    displayName: primary
      ? `${primary.honorific} ${primary.name}`
      : user?.fullName || "Your profile",
  };
}
