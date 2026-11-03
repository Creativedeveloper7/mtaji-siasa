"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@/types";

interface InitialProject {
  project: Project | null;
  /** Links to the X posts this project was advertised with (read on the server) */
  xPosts: string[];
}

const InitialProjectContext = createContext<InitialProject>({ project: null, xPosts: [] });

/**
 * The project as the server read it, so the page can render it before the
 * client content store has loaded. Ad reviewers (X) read the server HTML
 * without running the app; they used to get only "Loading…".
 */
export function InitialProjectProvider({
  project,
  xPosts = [],
  children,
}: {
  project: Project | null;
  xPosts?: string[];
  children: ReactNode;
}) {
  return <InitialProjectContext.Provider value={{ project, xPosts }}>{children}</InitialProjectContext.Provider>;
}

export function useInitialProject(): Project | null {
  return useContext(InitialProjectContext).project;
}

export function useProjectXPosts(): string[] {
  return useContext(InitialProjectContext).xPosts;
}
