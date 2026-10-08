import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { actorFromSession, type ContentResult } from "@/server/content/service";
import { topUpWallet } from "@/server/wallet/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireRoles(["admin", "leader", "aspirant"]);
  if (gate.response || !gate.session) {
    return gate.response ?? NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const actor = actorFromSession(gate.session);
  if ("ok" in actor) {
    return NextResponse.json({ ok: false, error: actor.error }, { status: actor.status });
  }
  let body: { amount?: unknown; source?: unknown; leaderId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(topUpWallet(actor, { amount: body.amount, source: body.source, leaderId: body.leaderId }));
}

function send(result: ContentResult) {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
