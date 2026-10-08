import { spawnSync } from "node:child_process";
import path from "node:path";

export type SupabaseCall =
  | { kind: "rpc"; fn: string; args?: Record<string, unknown> }
  | { kind: "rest"; method: string; path: string; body?: unknown; prefer?: string };

function endpoint(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return { url, key };
}

function headers(key: string, hasBody: boolean, prefer?: string): HeadersInit {
  const result: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Accept-Profile": "mtaji",
    "Content-Profile": "mtaji",
  };
  if (hasBody) result["Content-Type"] = "application/json";
  if (prefer) result.Prefer = prefer;
  return result;
}

function asError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export async function supabaseCall<T>(call: SupabaseCall): Promise<T> {
  const { url, key } = endpoint();
  const pathName = call.kind === "rpc" ? `/rest/v1/rpc/${call.fn}` : call.path;
  const method = call.kind === "rpc" ? "POST" : call.method;
  const payload = call.kind === "rpc" ? (call.args ?? {}) : call.body;
  const hasBody = call.kind === "rpc" || call.body !== undefined;
  const response = await fetch(`${url}${pathName}`, {
    method,
    headers: headers(key, hasBody, call.kind === "rest" ? call.prefer : undefined),
    body: hasBody ? JSON.stringify(payload) : undefined,
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw new Error(asError(data, text || `Supabase ${response.status}`));
  }
  return data as T;
}

export function supabaseCallSync<T>(call: SupabaseCall): T {
  const [data] = supabaseBatchSync<T>([call]);
  return data;
}

export function supabaseBatchSync<T>(calls: SupabaseCall[]): T[] {
  const { url, key } = endpoint();
  const script = path.join(process.cwd(), "src/server/supabase/call.mjs");
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ url, key, calls }),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!result.stdout) {
    throw new Error(result.stderr || "Supabase call returned no data.");
  }
  const parsed = JSON.parse(result.stdout) as { ok: boolean; error?: string; data?: T[] };
  if (!parsed.ok) throw new Error(parsed.error || "Supabase call failed.");
  return parsed.data ?? [];
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  return supabaseCall<T>({ kind: "rpc", fn, args });
}

export function rpcSync<T>(fn: string, args?: Record<string, unknown>): T {
  return supabaseCallSync<T>({ kind: "rpc", fn, args });
}
