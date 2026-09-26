"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useContent } from "@/components/content/ContentProvider";
import { createId, slugify } from "@/lib/store";
import type { Leader } from "@/types";

/** Resolve (or create) the Leader profile for the signed-in politician */
export function usePoliticianProfile() {
  const { user, users, linkLeaderProfile } = useAuth();
  const { content, upsertLeader, ready } = useContent();

  const account = useMemo(
    () => users.find((u) => u.id === user?.userId),
    [users, user]
  );

  const leader = useMemo(() => {
    if (!account?.leaderId) return undefined;
    return content.leaders.find((l) => l.id === account.leaderId);
  }, [account, content.leaders]);

  useEffect(() => {
    if (!user || !account) return;
    if (user.role !== "leader" && user.role !== "aspirant") return;
    if (account.leaderId && content.leaders.some((l) => l.id === account.leaderId)) {
      return;
    }

    const existingByName = content.leaders.find(
      (l) => l.name.toLowerCase() === account.fullName.toLowerCase()
    );
    if (existingByName) {
      linkLeaderProfile(account.id, existingByName.id);
      return;
    }

    const id = createId("ldr");
    const profile: Leader = {
      id,
      slug: slugify(account.fullName) || id,
      name: account.fullName,
      honorific: user.role === "aspirant" ? "H.E." : "Hon.",
      position:
        user.role === "aspirant"
          ? "Political aspirant — profile in progress"
          : "Elected leader — profile in progress",
      type: user.role === "aspirant" ? "aspirant" : "elected",
      county: "Nairobi",
      photo:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
      shortBio: "Complete your profile to showcase your development record.",
      bio: "Welcome to your M-Taji Siasa politician workspace. Update your biography, publish projects with GIS evidence, and engage citizens through Faida.",
      achievements: [],
      social: {},
      projectIds: [],
      opportunityIds: [],
      mediaIds: [],
      pollIds: [],
      productIds: [],
      vision:
        user.role === "aspirant"
          ? {
              statement: "Add your vision statement for citizens to discover.",
              manifesto: [],
              priorities: [],
              proposedProjects: [],
              expectedImpact: [],
            }
          : undefined,
    };
    upsertLeader(profile);
    linkLeaderProfile(account.id, id);
  }, [user, account, content.leaders, linkLeaderProfile, upsertLeader]);

  return {
    ready,
    user,
    account,
    leader,
    isAspirant: leader?.type === "aspirant" || user?.role === "aspirant",
  };
}
