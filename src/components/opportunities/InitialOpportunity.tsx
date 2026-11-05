"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Opportunity } from "@/types";

const InitialOpportunityContext = createContext<Opportunity | null>(null);

/**
 * The opportunity as the server read it, so the page can render it before the
 * client content store has loaded. Ad reviewers (X) read the server HTML
 * without running the app; otherwise they see only "Loading…".
 */
export function InitialOpportunityProvider({ opportunity, children }: { opportunity: Opportunity | null; children: ReactNode }) {
  return <InitialOpportunityContext.Provider value={opportunity}>{children}</InitialOpportunityContext.Provider>;
}

export function useInitialOpportunity(): Opportunity | null {
  return useContext(InitialOpportunityContext);
}
