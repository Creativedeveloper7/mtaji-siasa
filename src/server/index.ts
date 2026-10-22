import { createMemoryRepositories } from "@/server/memory/database";
import type { AppRepositories } from "@/server/repositories";
import { createTrackerRepositories } from "@/server/tracker/database";

const MEMORY_ADAPTER_VERSION = 7;

type ServerSlot = {
  version: number;
  memory: AppRepositories;
  tracker?: AppRepositories;
};

const globalStore = globalThis as typeof globalThis & {
  __mtajiServer?: ServerSlot;
};

/**
 * The Tracker adapter is used when the public Supabase URL and anon key are set.
 * MTAJI_STORE=memory forces the in-memory store, e.g. to try changes on sample data.
 */
export function usesTracker(): boolean {
  if (process.env.MTAJI_STORE === "memory") return false;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

function slot(): ServerSlot {
  const current = globalStore.__mtajiServer;
  if (current?.version === MEMORY_ADAPTER_VERSION) return current;
  const next: ServerSlot = {
    version: MEMORY_ADAPTER_VERSION,
    memory: createMemoryRepositories(),
  };
  globalStore.__mtajiServer = next;
  return next;
}

/** Shared process store: the Tracker adapter when configured, else the memory adapter. */
export function getRepositories(): AppRepositories {
  const current = slot();
  if (!usesTracker()) return current.memory;
  current.tracker ??= createTrackerRepositories(current.memory);
  return current.tracker;
}

export type { AppRepositories } from "@/server/repositories";
export type {
  AdlyInterestLead,
  NewUserInput,
  PublicUser,
  SeedCounts,
  WalletRecord,
} from "@/server/domain";
