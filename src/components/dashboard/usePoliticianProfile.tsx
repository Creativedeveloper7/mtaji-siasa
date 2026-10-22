"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useContent } from "@/components/content/ContentProvider";
import { apiJson } from "@/lib/api-client";
import type { PlatformContent } from "@/lib/store";
import type { Leader } from "@/types";
import type { AuthSession } from "@/types/auth";

/**
 * A politician who has no leader profile yet (no political_figures row on the
 * Tracker). Their content is listed under their Phase 1 leader id
 * `user-<uid>`, so the workspace works on this draft until they save their
 * profile, which creates the real one.
 */
function draftLeader(user: AuthSession, content: PlatformContent): Leader {
  const id = user.leaderId!;
  const aspirant = user.role === "aspirant";
  return {
    id,
    slug: "",
    name: user.fullName,
    honorific: aspirant ? "" : "Hon.",
    position: "",
    type: aspirant ? "aspirant" : "elected",
    county: "Nairobi",
    photo: "",
    shortBio: "",
    bio: "",
    achievements: [],
    social: {},
    projectIds: content.projects.filter((p) => p.leaderIds.includes(id)).map((p) => p.id),
    opportunityIds: content.opportunities.filter((o) => o.leaderId === id).map((o) => o.id),
    mediaIds: content.media.filter((m) => m.leaderId === id).map((m) => m.id),
    pollIds: content.polls.filter((p) => p.leaderId === id).map((p) => p.id),
    productIds: content.products.filter((p) => p.leaderId === id).map((p) => p.id),
  };
}

/** Resolve the Leader profile for the signed-in politician, opening the workspace on the server when needed. */
export function usePoliticianProfile() {
  const { user, users, ready: authReady, applySession } = useAuth();
  const { content, ready: contentReady, reload } = useContent();
  const pending = useRef<string | null>(null);

  const account = users.find((entry) => entry.id === user?.userId);
  const stored = content.leaders.find((item) => item.id === user?.leaderId);
  const draft = useMemo(
    () =>
      !stored && user?.leaderId && (user.role === "leader" || user.role === "aspirant")
        ? draftLeader(user, content)
        : undefined,
    [stored, user, content]
  );
  const leader = stored ?? draft;
  const leaderReady = Boolean(leader);

  useEffect(() => {
    if (!authReady || !contentReady || !user || leaderReady) return;
    if (
      user.role !== "leader" &&
      user.role !== "aspirant" &&
      user.role !== "citizen" &&
      user.role !== "organization"
    ) {
      return;
    }
    // Once per user: the answer does not change by asking again.
    if (pending.current === user.userId) return;
    pending.current = user.userId;
    let cancel = false;
    (async () => {
      const result = await apiJson<{ session?: AuthSession }>("/api/auth/profile", {
        method: "POST",
      });
      if (cancel) {
        pending.current = null;
        return;
      }
      if (result.ok && result.data.session) {
        await reload();
        applySession(result.data.session);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [authReady, contentReady, user, leaderReady, applySession, reload]);

  return {
    ready: authReady && contentReady,
    user,
    account,
    leader,
    /** True while the politician has no saved leader profile (see draftLeader). */
    isDraft: !stored && Boolean(draft),
    isAspirant: leader?.type === "aspirant" || user?.role === "aspirant",
  };
}
