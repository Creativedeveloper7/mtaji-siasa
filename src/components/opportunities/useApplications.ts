"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiJson } from "@/lib/api-client";
import type { ApplicationView } from "@/types";

/**
 * Applications for the signed-in user.
 * scope "mine" = what I applied for; "received" = applications to opportunities I published.
 */
export function useApplications(scope: "mine" | "received") {
  const { user, ready: authReady } = useAuth();
  const [items, setItems] = useState<ApplicationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const result = await apiJson<{ items?: ApplicationView[]; error?: string }>(
      `/api/applications?scope=${scope}`
    );
    if (result.ok && result.data.items) {
      setItems(result.data.items);
      setError("");
    } else {
      setError(result.data.error || "Could not load applications.");
    }
    setLoading(false);
  }, [scope, user]);

  useEffect(() => {
    if (!authReady) return;
    void reload();
  }, [authReady, reload]);

  return { items, loading: !authReady || loading, error, reload, setItems };
}
