import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import { asString, isRecord } from "@/server/content/parse";
import type { ContentResult } from "@/server/content/service";
import { actOnAdCampaign, asAction } from "@/server/ads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** { action: approve | reject | pause | resume | stop | sync, note? } */
export async function POST(request: Request, context: Context) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const action = isRecord(body) ? asAction(body.action) : null;
  if (!action) return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  return send(await actOnAdCampaign(session, id, action, isRecord(body) ? asString(body.note) : undefined));
}

function send(result: ContentResult) {
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}
