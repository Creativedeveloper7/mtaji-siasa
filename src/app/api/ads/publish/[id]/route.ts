import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { requireRoles } from "@/server/auth/http";
import { publishCampaign } from "@/server/tracker/adly/service";
import { readBody, send, trackerOnly } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/**
 * Publish (or republish) an Adly campaign to its live networks through the
 * Tracker edge functions. Body: { channel?: "google" | "x" }. Only the owner
 * can publish: the edge functions check ownership against the user's token.
 */
export async function POST(request: Request, context: Context) {
  if (!usesTracker()) return trackerOnly();
  const gate = await requireRoles(["leader", "aspirant", "admin"]);
  if (gate.response || !gate.session) {
    return gate.response ?? NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  return send(await publishCampaign(gate.session, id, await readBody(request), new URL(request.url).origin));
}
