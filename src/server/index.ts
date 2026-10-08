import { createMemoryRepositories } from "@/server/memory/database";
import type { AppRepositories } from "@/server/repositories";
import { getSupabaseRepositories } from "@/server/supabase/database";

const MEMORY_ADAPTER_VERSION = 4;

type ServerSlot = {
  version: number;
  repositories: AppRepositories;
};

const globalStore = globalThis as typeof globalThis & {
  __mtajiServer?: ServerSlot;
};

function usesSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Shared process store. Supabase is used when its URL and service role key are set. */
export function getRepositories(): AppRepositories {
  if (usesSupabase()) return getSupabaseRepositories();
  const current = globalStore.__mtajiServer;
  if (current?.version === MEMORY_ADAPTER_VERSION) {
    return current.repositories;
  }
  const repositories = createMemoryRepositories();
  globalStore.__mtajiServer = {
    version: MEMORY_ADAPTER_VERSION,
    repositories,
  };
  return repositories;
}

export type { AppRepositories } from "@/server/repositories";
export type {
  AdlyInterestLead,
  NewUserInput,
  PublicUser,
  SeedCounts,
  WalletRecord,
} from "@/server/domain";
export { toPublicUser } from "@/server/domain";
