import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { readRequestSession } from "@/server/auth/http";
import { createAdCampaign, listAdCampaigns } from "@/server/ads/service";
import { createTrackerAd, listTrackerAds } from "@/server/tracker/adly/service";
import { readBody, send } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Publishing calls the Tracker edge functions for each network.
export const maxDuration = 60;

/**
 * Paid ads for the dashboard composer. ?scope=mine (default) or ?scope=all (admin).
 * Tracker backend: adly_campaigns + publish edge functions. Memory store: the legacy service.
 */
export async function GET(request: Request) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "mine";
  if (!usesTracker()) return send(await listAdCampaigns(session, scope));
  return send(await listTrackerAds(session, scope));
}

export async function POST(request: Request) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const body = await readBody(request);
  if (body === null) return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  const origin = new URL(request.url).origin;
  if (!usesTracker()) return send(await createAdCampaign(session, body, origin));
  return send(await createTrackerAd(session, body, origin));
}
