"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { loadAdlyContent, saveAdlyContent } from "@/lib/adly-store";
import { createId } from "@/lib/store";

interface AdlyContextValue {
  ready: boolean;
  content: AdlyContent;
  stats: ReturnType<typeof computeAdlyStats>;
  resetToSeed: () => void;
  upsertCampaign: (item: Campaign) => void;
  deleteCampaign: (id: string) => void;
  getCampaign: (id: string) => Campaign | undefined;
  upsertCreative: (item: AdCreative) => void;
  upsertPolicyReview: (item: PolicyReview) => void;
  upsertPoster: (item: Poster) => void;
  upsertTimelapse: (item: Timelapse) => void;
  upsertSimulation: (item: Simulation) => void;
  addInsight: (item: Omit<AdlyInsight, "id"> & { id?: string }) => void;
}

const AdlyContext = createContext<AdlyContextValue | null>(null);

function upsertIn<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function AdlyProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<AdlyContent>(() => createSeedAdlyContent());
  const [ready, setReady] = useState(true);

  useEffect(() => {
    try {
      setContent(loadAdlyContent());
    } catch {
      /* keep seed */
    } finally {
      setReady(true);
    }
  }, []);

  const persist = useCallback((next: AdlyContent) => {
    setContent(next);
    saveAdlyContent(next);
  }, []);

  const value = useMemo<AdlyContextValue>(
    () => ({
      ready,
      content,
      stats: computeAdlyStats(content),
      resetToSeed: () => persist(createSeedAdlyContent()),
      upsertCampaign: (item) =>
        persist({ ...content, campaigns: upsertIn(content.campaigns, item) }),
      deleteCampaign: (id) =>
        persist({
          ...content,
          campaigns: content.campaigns.filter((c) => c.id !== id),
        }),
      getCampaign: (id) => content.campaigns.find((c) => c.id === id),
      upsertCreative: (item) =>
        persist({ ...content, creatives: upsertIn(content.creatives, item) }),
      upsertPolicyReview: (item) =>
        persist({
          ...content,
          policyReviews: upsertIn(content.policyReviews, item),
        }),
      upsertPoster: (item) =>
        persist({ ...content, posters: upsertIn(content.posters, item) }),
      upsertTimelapse: (item) =>
        persist({ ...content, timelapses: upsertIn(content.timelapses, item) }),
      upsertSimulation: (item) =>
        persist({
          ...content,
          simulations: upsertIn(content.simulations, item),
        }),
      addInsight: (item) =>
        persist({
          ...content,
          insights: [
            { ...item, id: item.id || createId("ins") },
            ...content.insights,
          ],
        }),
    }),
    [ready, content, persist]
  );

  return <AdlyContext.Provider value={value}>{children}</AdlyContext.Provider>;
}

export function useAdly() {
  const ctx = useContext(AdlyContext);
  if (!ctx) throw new Error("useAdly must be used within AdlyProvider");
  return ctx;
}
