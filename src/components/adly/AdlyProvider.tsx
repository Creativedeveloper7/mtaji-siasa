"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdCreative,
  AdlyContent,
  AdlyInsight,
  Campaign,
  PolicyReview,
  Poster,
  Simulation,
  Timelapse,
} from "@/types/adly";
import { computeAdlyStats, createSeedAdlyContent } from "@/data/adly";
import { apiJson } from "@/lib/api-client";
import { createId } from "@/lib/store";

interface AdlyContextValue {
  ready: boolean;
  content: AdlyContent;
  stats: ReturnType<typeof computeAdlyStats>;
  resetToSeed: () => void;
  upsertCampaign: (item: Campaign) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  getCampaign: (id: string) => Campaign | undefined;
  upsertCreative: (item: AdCreative) => Promise<void>;
  upsertPolicyReview: (item: PolicyReview) => Promise<void>;
  upsertPoster: (item: Poster) => Promise<void>;
  upsertTimelapse: (item: Timelapse) => Promise<void>;
  upsertSimulation: (item: Simulation) => Promise<void>;
  addInsight: (item: Omit<AdlyInsight, "id"> & { id?: string }) => Promise<void>;
}

const AdlyContext = createContext<AdlyContextValue | null>(null);

export function AdlyProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<AdlyContent>(() => createSeedAdlyContent());
  const [ready, setReady] = useState(false);
  const queue = useRef(Promise.resolve());

  const reload = useCallback(async () => {
    const result = await apiJson<{ content?: AdlyContent }>("/api/adly");
    if (result.ok && result.data.content) setContent(result.data.content);
  }, []);

  useEffect(() => {
    let cancel = false;
    reload().finally(() => {
      if (!cancel) setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [reload]);

  const enqueue = useCallback((task: () => Promise<void>) => {
    const run = queue.current.then(task, task);
    queue.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }, []);

  const save = useCallback(
    (collection: string, item: unknown) =>
      enqueue(async () => {
        const result = await apiJson(`/api/adly/${collection}`, {
          method: "PUT",
          body: JSON.stringify(item),
        });
        if (result.ok) await reload();
      }),
    [enqueue, reload]
  );

  const value = useMemo<AdlyContextValue>(
    () => ({
      ready,
      content,
      stats: computeAdlyStats(content),
      resetToSeed: () => {
        void enqueue(async () => {
          const result = await apiJson<{ content?: AdlyContent }>("/api/adly/reset", { method: "POST" });
          if (result.ok && result.data.content) setContent(result.data.content);
        });
      },
      upsertCampaign: (item) => save("campaigns", item),
      deleteCampaign: (id) =>
        enqueue(async () => {
          const result = await apiJson(`/api/adly/campaigns?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (result.ok) await reload();
        }),
      getCampaign: (id) => content.campaigns.find((item) => item.id === id),
      upsertCreative: (item) => save("creatives", item),
      upsertPolicyReview: (item) => save("policy-reviews", item),
      upsertPoster: (item) => save("posters", item),
      upsertTimelapse: (item) => save("timelapses", item),
      upsertSimulation: (item) => save("simulations", item),
      addInsight: (item) => save("insights", { ...item, id: item.id || createId("ins") }),
    }),
    [ready, content, enqueue, reload, save]
  );

  return <AdlyContext.Provider value={value}>{children}</AdlyContext.Provider>;
}

export function useAdly() {
  const ctx = useContext(AdlyContext);
  if (!ctx) throw new Error("useAdly must be used within AdlyProvider");
  return ctx;
}
