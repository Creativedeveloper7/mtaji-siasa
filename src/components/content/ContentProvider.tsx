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
  Leader,
  MediaItem,
  Opportunity,
  Poll,
  Product,
  Project,
  ProjectMilestone,
} from "@/types";
import { apiJson } from "@/lib/api-client";
import { createSeedContent, type PlatformContent } from "@/lib/store";

interface ContentContextValue {
  ready: boolean;
  content: PlatformContent;
  reload: () => Promise<void>;
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

const COLLECTIONS = {
  leaders: "leaders",
  projects: "projects",
  milestones: "milestones",
  opportunities: "opportunities",
  media: "media",
  polls: "polls",
  products: "products",
} as const;

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<PlatformContent>(() => createSeedContent());
  const [ready, setReady] = useState(false);
  const queue = useRef(Promise.resolve());

  const reload = useCallback(async () => {
    const result = await apiJson<{ content?: PlatformContent }>("/api/content");
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
    (collection: string, item: unknown) => {
      void enqueue(async () => {
        const result = await apiJson(`/api/content/${collection}`, {
          method: "PUT",
          body: JSON.stringify(item),
        });
        if (result.ok) await reload();
      });
    },
    [enqueue, reload]
  );

  const remove = useCallback(
    (collection: string, id: string) => {
      void enqueue(async () => {
        const result = await apiJson(`/api/content/${collection}?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (result.ok) await reload();
      });
    },
    [enqueue, reload]
  );

  const resetToSeed = useCallback(() => {
    void enqueue(async () => {
      const result = await apiJson<{ content?: PlatformContent }>("/api/content/reset", { method: "POST" });
      if (result.ok && result.data.content) setContent(result.data.content);
    });
  }, [enqueue]);

  const value = useMemo<ContentContextValue>(
    () => ({
      ready,
      content,
      reload,
      resetToSeed,
      upsertLeader: (item) => save(COLLECTIONS.leaders, item),
      deleteLeader: (id) => remove(COLLECTIONS.leaders, id),
      upsertProject: (item) => save(COLLECTIONS.projects, item),
      deleteProject: (id) => remove(COLLECTIONS.projects, id),
      upsertMilestone: (item) => save(COLLECTIONS.milestones, item),
      deleteMilestone: (id) => remove(COLLECTIONS.milestones, id),
      upsertOpportunity: (item) => save(COLLECTIONS.opportunities, item),
      deleteOpportunity: (id) => remove(COLLECTIONS.opportunities, id),
      upsertMedia: (item) => save(COLLECTIONS.media, item),
      deleteMedia: (id) => remove(COLLECTIONS.media, id),
      upsertPoll: (item) => save(COLLECTIONS.polls, item),
      deletePoll: (id) => remove(COLLECTIONS.polls, id),
      upsertProduct: (item) => save(COLLECTIONS.products, item),
      deleteProduct: (id) => remove(COLLECTIONS.products, id),
      getLeaderBySlug: (slug) => content.leaders.find((item) => item.slug === slug),
      getProjectBySlug: (slug) => content.projects.find((item) => item.slug === slug),
      getOpportunityBySlug: (slug) => content.opportunities.find((item) => item.slug === slug),
      getMediaBySlug: (slug) => content.media.find((item) => item.slug === slug),
      getProjectsByIds: (ids) => content.projects.filter((item) => ids.includes(item.id)),
      getMilestonesByProject: (projectId) =>
        content.milestones.filter((item) => item.projectId === projectId).sort((a, b) => a.number - b.number),
      getOpportunitiesByIds: (ids) => content.opportunities.filter((item) => ids.includes(item.id)),
      getMediaByIds: (ids) => content.media.filter((item) => ids.includes(item.id)),
      getPollsByIds: (ids) => content.polls.filter((item) => ids.includes(item.id)),
      getProductsByLeader: (leaderId) => content.products.filter((item) => item.leaderId === leaderId),
    }),
    [ready, content, reload, resetToSeed, save, remove]
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error("useContent must be used within ContentProvider");
  return ctx;
}
