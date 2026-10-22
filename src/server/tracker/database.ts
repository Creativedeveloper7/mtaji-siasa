import type { AppRepositories } from "@/server/repositories";
import { createTrackerUserRepository } from "@/server/tracker/users";

/**
 * Repositories backed by the M-Taji Tracker Supabase project.
 * Phase 1 moves accounts only; the other stores still run on the memory
 * adapter passed in, and later phases replace them one by one.
 */
export function createTrackerRepositories(memory: AppRepositories): AppRepositories {
  const users = createTrackerUserRepository();
  return {
    users,
    // Phase 2/3: moves to Tracker tables
    content: memory.content,
    // Phase 2/3: moves to Tracker tables
    adly: memory.adly,
    // Phase 2/3: moves to Tracker tables
    wallets: memory.wallets,
    // Phase 2/3: moves to Tracker tables
    engagement: memory.engagement,
    // Phase 2/3: moves to Tracker tables
    applications: memory.applications,
    // Phase 2/3: moves to Tracker tables
    adCampaigns: memory.adCampaigns,
    counts: async () => ({ ...(await memory.counts()), users: await users.count() }),
    /** Resets the memory-backed stores only. Tracker accounts are never reset. */
    resetAll: () => memory.resetAll(),
  };
}
