import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/server/tracker/clients", () => ({
  userClient: async () => {
    throw new Error("not used");
  },
}));

const { deleteTrackerImage } = await import("./images");

const BASE = "https://jdddchjbglilkfrlenci.supabase.co";
const UID = "11111111-1111-4111-8111-111111111111";

function client(removed: string[][]) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

describe("deleteTrackerImage", () => {
  const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
  });

  it("returns false (not a 500) for a URL with malformed percent-encoding", async () => {
    const removed: string[][] = [];
    const url = `${BASE}/storage/v1/object/public/initiative-images/${UID}/2026-10/%E0%A4%A`;
    await expect(deleteTrackerImage(url, async () => client(removed))).resolves.toBe(false);
    expect(removed).toEqual([]);
  });

  it("deletes the caller's own object", async () => {
    const removed: string[][] = [];
    const url = `${BASE}/storage/v1/object/public/initiative-images/${UID}/2026-10/abc.jpg`;
    await expect(deleteTrackerImage(url, async () => client(removed))).resolves.toBe(true);
    expect(removed).toEqual([[`${UID}/2026-10/abc.jpg`]]);
  });
});
