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

/** One campaign plan saved in a single request (one adly_campaigns row on the Tracker). */
export interface AdlyPlanInput {
  campaign: Campaign;
  creative?: AdCreative;
  policyReview?: PolicyReview;
}

interface AdlyContextValue {
  ready: boolean;
  /** "tracker" when campaigns live in the M-Taji Tracker (chat, publish and live results available) */
  backend: "tracker" | "memory";
  content: AdlyContent;
  stats: ReturnType<typeof computeAdlyStats>;
  resetToSeed: () => void;
  upsertCampaign: (item: Campaign) => Promise<void>;
  /** Save campaign + creative + policy review together. Returns the saved campaign (server id). */
  savePlan: (plan: AdlyPlanInput) => Promise<{ ok: boolean; campaign?: Campaign; error?: string }>;
  reload: () => Promise<void>;
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
  const [backend, setBackend] = useState<"tracker" | "memory">("memory");
  const queue = useRef(Promise.resolve());

  const reload = useCallback(async () => {
    const result = await apiJson<{ content?: AdlyContent; backend?: "tracker" }>("/api/adly/workspace");
    if (result.ok && result.data.content) {
      setContent(result.data.content);
      setBackend(result.data.backend === "tracker" ? "tracker" : "memory");
    }
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

  const savePlan = useCallback(
    (plan: AdlyPlanInput) => {
      let outcome: { ok: boolean; campaign?: Campaign; error?: string } = { ok: false };
      return enqueue(async () => {
        const result = await apiJson<{ item?: Campaign; error?: string }>("/api/adly/plans", {
          method: "PUT",
          body: JSON.stringify(plan),
        });
        outcome = { ok: result.ok, campaign: result.data.item, error: result.data.error };
        if (result.ok) await reload();
      }).then(() => outcome);
    },
    [enqueue, reload]
  );

  const value = useMemo<AdlyContextValue>(
    () => ({
      ready,
      backend,
      reload,
      savePlan,
      content,
      stats: computeAdlyStats(content),
      resetToSeed: () => {
        void enqueue(async () => {
          const result = await apiJson<{ content?: AdlyContent }>("/api/adly/reset", { method: "POST" });
          if (result.ok && result.data.content) setContent(result.data.content);
        });
      },
      upsertCampaign: (item) =>
        enqueue(async () => {
          const result = await apiJson("/api/adly/plans", { method: "PUT", body: JSON.stringify({ campaign: item }) });
          if (result.ok) await reload();
        }),
      deleteCampaign: (id) =>
        enqueue(async () => {
          const result = await apiJson(`/api/adly/plans?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          if (result.ok) await reload();
        }),
      getCampaign: (id) => content.campaigns.find((item) => item.id === id),
      upsertCreative: (item) =>
        backend === "tracker"
          ? enqueue(async () => {
              const result = await apiJson("/api/adly/plans", { method: "PUT", body: JSON.stringify({ creative: item }) });
              if (result.ok) await reload();
            })
          : save("creatives", item),
      upsertPolicyReview: (item) =>
        backend === "tracker"
          ? enqueue(async () => {
              const result = await apiJson("/api/adly/plans", {
                method: "PUT",
                body: JSON.stringify({ campaign: { id: item.campaignId }, policyReview: item }),
              });
              if (result.ok) await reload();
            })
          : save("policy-reviews", item),
      upsertPoster: (item) => save("posters", item),
      upsertTimelapse: (item) => save("timelapses", item),
      upsertSimulation: (item) => save("simulations", item),
      addInsight: (item) => save("insights", { ...item, id: item.id || createId("ins") }),
    }),
    [ready, backend, content, enqueue, reload, save, savePlan]
  );

  return <AdlyContext.Provider value={value}>{children}</AdlyContext.Provider>;
}

export function useAdly() {
  const ctx = useContext(AdlyContext);
  if (!ctx) throw new Error("useAdly must be used within AdlyProvider");
  return ctx;
}
