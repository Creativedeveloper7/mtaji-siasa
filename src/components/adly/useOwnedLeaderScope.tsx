"use client";

import { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useContent } from "@/components/content/ContentProvider";
import { usePoliticianProfile } from "@/components/dashboard/usePoliticianProfile";
import type { Leader, Project } from "@/types";

/**
 * Leaders / projects the signed-in user may act on in Adly.
 * Politicians only see their own linked profile; admins see everyone.
 */
export function useOwnedLeaderScope() {
  const { user } = useAuth();
  const { content, ready: contentReady } = useContent();
  const { leader, account, ready: profileReady } = usePoliticianProfile();
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

  const projects = useMemo(() => {
    // Politicians: only projects uploaded on their own profile (projectIds).
    // Admins: full list — pages filter by the leader they select.
    if (isAdmin) return content.projects;
    if (!primary) return [];
    const ownedIds = new Set(primary.projectIds);
    return content.projects.filter((p) => ownedIds.has(p.id));
  }, [isAdmin, primary, content.projects]);

  return {
    ready: contentReady && profileReady,
    isAdmin,
    leaders,
    leader: primary as Leader | undefined,
    leaderId: primary?.id || "",
    projects: projects as Project[],
    ownedProjectIds: primary?.projectIds ?? [],
    displayName: primary
      ? `${primary.honorific} ${primary.name}`
      : user?.fullName || "Your profile",
  };
}
