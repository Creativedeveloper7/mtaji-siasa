"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Project } from "@/types";

const InitialProjectContext = createContext<Project | null>(null);

/**
 * The project as the server read it, so the page can render it before the
 * client content store has loaded. Ad reviewers (X) read the server HTML
 * without running the app; they used to get only "Loading…".
 */
export function InitialProjectProvider({ project, children }: { project: Project | null; children: ReactNode }) {
  return <InitialProjectContext.Provider value={project}>{children}</InitialProjectContext.Provider>;
}

export function useInitialProject(): Project | null {
  return useContext(InitialProjectContext);
}
