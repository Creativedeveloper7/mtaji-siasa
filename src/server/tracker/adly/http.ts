import "server-only";
import { NextResponse } from "next/server";
import type { AuthSession } from "@/types/auth";
import { requireRoles } from "@/server/auth/http";
import { actorFromSession, type ContentActor, type ContentResult } from "@/server/content/service";

/** Shared bits for the Adly / ads route handlers. */

export function send(result: ContentResult) {
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}

export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function trackerOnly() {
  return NextResponse.json(
    { ok: false, error: "This needs the M-Taji Tracker backend (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)." },
    { status: 501 }
  );
}

/** Admin, leader or aspirant, as an Adly actor. */
export async function adlyEditor(): Promise<
  { actor: ContentActor; session: AuthSession; response?: undefined } | { response: NextResponse }
> {
  const gate = await requireRoles(["admin", "leader", "aspirant"]);
  if (gate.response || !gate.session) {
    return { response: gate.response ?? NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 }) };
  }
  const actor = actorFromSession(gate.session);
  if ("ok" in actor) return { response: NextResponse.json({ ok: false, error: actor.error }, { status: actor.status }) };
  return { actor, session: gate.session };
}
