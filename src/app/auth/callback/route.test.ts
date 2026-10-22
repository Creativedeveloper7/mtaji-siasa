import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  calls: [] as Array<[string, unknown]>,
  fail: false,
}));

vi.mock("@/server/tracker/clients", () => ({
  TrackerConfigError: class extends Error {},
  hasServiceRole: () => false,
  userClient: async () => state.client,
  anonClient: () => state.client,
  serviceClient: () => state.client,
}));

const { GET } = await import("@/app/auth/callback/route");

const env = { ...process.env };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  delete process.env.MTAJI_STORE;
});
afterAll(() => {
  process.env = env;
});
beforeEach(() => {
  state.calls = [];
  state.fail = false;
  const result = async () => ({ data: {}, error: state.fail ? { message: "bad" } : null });
  state.client = fakeSupabase(
    { tables: {}, updates: [] },
    {
      exchangeCodeForSession: async (code) => {
        state.calls.push(["exchange", code]);
        return result();
      },
      verifyOtp: async (input) => {
        state.calls.push(["verifyOtp", input]);
        return result();
      },
    }
  );
});

async function land(query: string): Promise<string> {
  const response = await GET(new Request(`https://siasa.example/auth/callback?${query}`));
  expect(response.status).toBeGreaterThanOrEqual(300);
  expect(response.status).toBeLessThan(400);
  return response.headers.get("location")!;
}

describe("/auth/callback", () => {
  it("keeps a same-site next", async () => {
    expect(await land("code=abc&next=%2Fdashboard%3Fx%3D1")).toBe(
      "https://siasa.example/signin?next=%2Fdashboard%3Fx%3D1"
    );
    expect(state.calls).toEqual([["exchange", "abc"]]);
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"])(
    "drops an off-site next %j",
    async (next) => {
      expect(await land(`code=abc&next=${encodeURIComponent(next)}`)).toBe(
        "https://siasa.example/signin"
      );
    }
  );

  it("sends a failed code exchange (other browser) to sign in, not to sign-up", async () => {
    state.fail = true;
    expect(await land("code=abc&next=%2Fadly")).toBe(
      "https://siasa.example/signin?confirmed=maybe&next=%2Fadly"
    );
  });

  it("verifies a token_hash link and reports a bad one as invalid", async () => {
    expect(await land("token_hash=th&type=signup")).toBe("https://siasa.example/signin");
    expect(state.calls).toEqual([["verifyOtp", { token_hash: "th", type: "signup" }]]);
    state.fail = true;
    expect(await land("token_hash=th&type=signup")).toBe(
      "https://siasa.example/signin?error=confirmation"
    );
  });

  it("reports a link with neither code nor token_hash as invalid", async () => {
    expect(await land("next=%2F")).toBe("https://siasa.example/signin?error=confirmation");
  });
});
