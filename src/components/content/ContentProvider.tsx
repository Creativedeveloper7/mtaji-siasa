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
  Leader,
  MediaItem,
  Opportunity,
  Poll,
  Product,
  Project,
  ProjectMilestone,
} from "@/types";
import {
  CONTENT_STORAGE_KEY,
  createSeedContent,
  readJson,
  writeJson,
  type PlatformContent,
} from "@/lib/store";

type EntityKey = keyof PlatformContent;

interface ContentContextValue {
  ready: boolean;
  content: PlatformContent;
  resetToSeed: () => void;
  upsertLeader: (item: Leader) => void;
  deleteLeader: (id: string) => void;
  upsertProject: (item: Project) => void;
  deleteProject: (id: string) => void;
  upsertMilestone: (item: ProjectMilestone) => void;
  deleteMilestone: (id: string) => void;
  upsertOpportunity: (item: Opportunity) => void;
  deleteOpportunity: (id: string) => void;
  upsertMedia: (item: MediaItem) => void;
  deleteMedia: (id: string) => void;
  upsertPoll: (item: Poll) => void;
  deletePoll: (id: string) => void;
  upsertProduct: (item: Product) => void;
  deleteProduct: (id: string) => void;
  getLeaderBySlug: (slug: string) => Leader | undefined;
  getProjectBySlug: (slug: string) => Project | undefined;
  getOpportunityBySlug: (slug: string) => Opportunity | undefined;
  getMediaBySlug: (slug: string) => MediaItem | undefined;
  getProjectsByIds: (ids: string[]) => Project[];
  getMilestonesByProject: (projectId: string) => ProjectMilestone[];
  getOpportunitiesByIds: (ids: string[]) => Opportunity[];
  getMediaByIds: (ids: string[]) => MediaItem[];
  getPollsByIds: (ids: string[]) => Poll[];
  getProductsByLeader: (leaderId: string) => Product[];
}

const ContentContext = createContext<ContentContextValue | null>(null);

function upsertIn<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<PlatformContent>(() => createSeedContent());
  const [ready, setReady] = useState(true);

  useEffect(() => {
    try {
      const stored = readJson<PlatformContent | null>(CONTENT_STORAGE_KEY, null);
      if (
        stored?.leaders?.length &&
        stored?.projects?.length &&
        Array.isArray(stored.milestones)
      ) {
        setContent({
          ...stored,
          products: (stored.products ?? []).map((p) => ({
            ...p,
            stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
          })),
        });
      } else {
        writeJson(CONTENT_STORAGE_KEY, createSeedContent());
      }
    } catch {
      /* keep seed content */
    }
  }, []);

  const persist = useCallback((next: PlatformContent) => {
    setContent(next);
    writeJson(CONTENT_STORAGE_KEY, next);
  }, []);

  const patch = useCallback(
    <K extends EntityKey>(key: K, list: PlatformContent[K]) => {
      persist({ ...content, [key]: list });
    },
    [content, persist]
  );

  const resetToSeed = useCallback(() => {
    const seed = createSeedContent();
    persist(seed);
  }, [persist]);

  const value = useMemo<ContentContextValue>(() => {
    return {
      ready,
      content,
      resetToSeed,
      upsertLeader: (item) => patch("leaders", upsertIn(content.leaders, item)),
      deleteLeader: (id) =>
        patch(
          "leaders",
          content.leaders.filter((l) => l.id !== id)
        ),
      upsertProject: (item) =>
        patch("projects", upsertIn(content.projects, item)),
      deleteProject: (id) =>
        patch(
          "projects",
          content.projects.filter((p) => p.id !== id)
        ),
      upsertMilestone: (item) =>
        patch("milestones", upsertIn(content.milestones, item)),
      deleteMilestone: (id) =>
        patch(
          "milestones",
          content.milestones.filter((m) => m.id !== id)
        ),
      upsertOpportunity: (item) =>
        patch("opportunities", upsertIn(content.opportunities, item)),
      deleteOpportunity: (id) =>
        patch(
          "opportunities",
          content.opportunities.filter((o) => o.id !== id)
        ),
      upsertMedia: (item) => patch("media", upsertIn(content.media, item)),
      deleteMedia: (id) =>
        patch(
          "media",
          content.media.filter((m) => m.id !== id)
        ),
      upsertPoll: (item) => patch("polls", upsertIn(content.polls, item)),
      deletePoll: (id) =>
        patch(
          "polls",
          content.polls.filter((p) => p.id !== id)
        ),
      upsertProduct: (item) =>
        patch("products", upsertIn(content.products, item)),
      deleteProduct: (id) =>
        patch(
          "products",
          content.products.filter((p) => p.id !== id)
        ),
      getLeaderBySlug: (slug) => content.leaders.find((l) => l.slug === slug),
      getProjectBySlug: (slug) => content.projects.find((p) => p.slug === slug),
      getOpportunityBySlug: (slug) =>
        content.opportunities.find((o) => o.slug === slug),
      getMediaBySlug: (slug) => content.media.find((m) => m.slug === slug),
      getProjectsByIds: (ids) =>
        content.projects.filter((p) => ids.includes(p.id)),
      getMilestonesByProject: (projectId) =>
        content.milestones
          .filter((m) => m.projectId === projectId)
          .sort((a, b) => a.number - b.number),
      getOpportunitiesByIds: (ids) =>
        content.opportunities.filter((o) => ids.includes(o.id)),
      getMediaByIds: (ids) => content.media.filter((m) => ids.includes(m.id)),
      getPollsByIds: (ids) => content.polls.filter((p) => ids.includes(p.id)),
      getProductsByLeader: (leaderId) =>
        content.products.filter((p) => p.leaderId === leaderId),
    };
  }, [ready, content, resetToSeed, patch]);

  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}

export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error("useContent must be used within ContentProvider");
  return ctx;
}
