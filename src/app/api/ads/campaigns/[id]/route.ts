import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { readRequestSession } from "@/server/auth/http";
import { asString, isRecord } from "@/server/content/parse";
import { actOnAdCampaign, asAction } from "@/server/ads/service";
import { actOnTrackerAd, asTrackerAdAction } from "@/server/tracker/adly/service";
import { readBody, send } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** { action: approve | reject | publish | pause | resume | stop | sync, note? } */
export async function POST(request: Request, context: Context) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const body = await readBody(request);
  const note = isRecord(body) ? asString(body.note) : undefined;
  if (!usesTracker()) {
    const action = isRecord(body) ? asAction(body.action) : null;
    if (!action) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    return send(await actOnAdCampaign(session, id, action, note));
  }
  const action = isRecord(body) ? asTrackerAdAction(body.action) : null;
  if (!action) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  // Same gate as /api/ads/publish/[id]: publishing and syncing are for leaders, aspirants and admins.
  if ((action === "publish" || action === "sync") && !["leader", "aspirant", "admin"].includes(session.role)) {
    return NextResponse.json({ ok: false, error: "Only leaders, aspirants and admins can publish or refresh ads." }, { status: 403 });
  }
  return send(await actOnTrackerAd(session, id, action, note, new URL(request.url).origin));
}
