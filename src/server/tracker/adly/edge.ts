import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Calls to the Tracker's Adly edge functions. They all run with
 * verify_jwt = true and check campaign ownership against the caller, so they
 * are called with the signed-in user's access token, never the service role.
 * Network credentials (Google Ads, X, Meta, TikTok, OpenAI) stay in the
 * Supabase function secrets.
 */

export class EdgeError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/** The user's access token, after confirming the user with auth.getUser(). */
export async function userAccessToken(client: SupabaseClient): Promise<{ userId: string; token: string }> {
  const { data: userData, error } = await client.auth.getUser();
  if (error || !userData.user) throw new EdgeError("Sign in required.", 401);
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new EdgeError("Your session has expired. Sign in again.", 401);
  return { userId: userData.user.id, token };
}

function functionsUrl(name: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!base) throw new EdgeError("NEXT_PUBLIC_SUPABASE_URL is not set.", 500);
  return `${base}/functions/v1/${name}`;
}

export interface EdgeResponse {
  status: number;
  ok: boolean;
  json: Record<string, unknown>;
}

/** POST JSON to an edge function. Never throws on HTTP errors; the caller reads `ok`/`json`. */
export async function callEdge(
  name: string,
  token: string,
  body: unknown,
  timeoutMs = 55_000
): Promise<EdgeResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(functionsUrl(name), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, ok: res.ok, json };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new EdgeError(`${name} timed out.`, 504);
    }
    throw new EdgeError(error instanceof Error ? error.message : `${name} could not be reached.`, 502);
  } finally {
    clearTimeout(timer);
  }
}

export function edgeErrorMessage(res: EdgeResponse, fallback: string): string {
  const raw = res.json.error ?? res.json.message;
  return typeof raw === "string" && raw.trim() ? raw : `${fallback} (${res.status})`;
}
