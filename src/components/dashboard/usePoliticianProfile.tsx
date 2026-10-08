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

  useEffect(() => {
    if (!authReady || !contentReady || !user) return;
    if (user.role !== "leader" && user.role !== "aspirant") return;
    if (user.leaderId && content.leaders.some((item) => item.id === user.leaderId)) return;
    if (pending.current === user.userId) return;
    pending.current = user.userId;
    let cancel = false;
    (async () => {
      const result = await apiJson<{ session?: AuthSession }>("/api/auth/profile", { method: "POST" });
      if (cancel) return;
      if (result.ok && result.data.session) {
        applySession(result.data.session);
        await reload();
      }
      pending.current = null;
    })();
    return () => {
      cancel = true;
    };
  }, [authReady, contentReady, user, content.leaders, applySession, reload]);

  return {
    ready: authReady && contentReady,
    user,
    account,
    leader,
    isAspirant: leader?.type === "aspirant" || user?.role === "aspirant",
  };
}
