"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useContent } from "@/components/content/ContentProvider";
import { apiJson } from "@/lib/api-client";
import type { AuthSession } from "@/types/auth";

/** Resolve the Leader profile for the signed-in politician, creating one on the server when needed. */
export function usePoliticianProfile() {
  const { user, users, ready: authReady, applySession } = useAuth();
  const { content, ready: contentReady, reload } = useContent();
  const pending = useRef<string | null>(null);

  const account = users.find((entry) => entry.id === user?.userId);
  const leader = content.leaders.find((item) => item.id === user?.leaderId);
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
      pending.current = null;
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
    isAspirant: leader?.type === "aspirant" || user?.role === "aspirant",
  };
}
