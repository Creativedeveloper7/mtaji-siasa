import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import type { ContentResult } from "@/server/content/service";
import { createAdCampaign, listAdCampaigns } from "@/server/ads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Publishing uploads images and calls two ad networks.
export const maxDuration = 60;

/** ?scope=mine (default) for a politician's campaigns; ?scope=all for admins. */
export async function GET(request: Request) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "mine";
  return send(await listAdCampaigns(session, scope));
}

export async function POST(request: Request) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(await createAdCampaign(session, body, new URL(request.url).origin));
}

function send(result: ContentResult) {
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}
