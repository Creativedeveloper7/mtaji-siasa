import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { getRepositories } from "@/server";
import { actorFromSession } from "@/server/content/service";
import { readWorkspace } from "@/server/adly/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requireRoles(["admin"]);
  if (gate.response || !gate.session) return gate.response;
  getRepositories().adly.reset();
  const actor = actorFromSession(gate.session);
  if ("ok" in actor) {
    return NextResponse.json({ ok: false, error: actor.error }, { status: actor.status });
  }
  const result = readWorkspace(actor);
  return NextResponse.json(result.ok ? result.body : { ok: false, error: result.error });
}
