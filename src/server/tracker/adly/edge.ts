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
    // Log the transport error; the client gets a generic message.
    console.error(`[adly] edge ${name} failed:`, error instanceof Error ? `${error.name}: ${error.message}` : error);
    if (error instanceof EdgeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new EdgeError("The ad service took too long to answer. Try again shortly.", 504);
    }
    throw new EdgeError("The ad service could not be reached. Try again shortly.", 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A client-safe message for a failed edge call. The raw edge / provider /
 * Postgres text is logged server-side and never returned.
 */
export function edgeErrorMessage(res: EdgeResponse, fallback: string, context = ""): string {
  const raw = res.json.error ?? res.json.message;
  console.error(`[adly] edge error${context ? ` (${context})` : ""}:`, res.status, typeof raw === "string" ? raw : JSON.stringify(raw ?? null));
  if (res.status === 401) return "Your session has expired. Sign in again.";
  if (res.status === 403) return "You can only manage your own campaigns.";
  if (res.status === 404) return "Campaign not found.";
  if (res.status === 429) return "The ad network is busy. Try again in a minute.";
  return `${fallback}. Try again shortly or contact support if it keeps happening.`;
}
