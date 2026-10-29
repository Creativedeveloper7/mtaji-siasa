import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import { reviewAdForX } from "@/server/ads/x-review";
import { readBody, send } from "@/server/tracker/adly/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Image checks and the optional AI review can take a few seconds each.
export const maxDuration = 60;

/** Adly's X policy review of a draft ad: { projectId, headline, body, keywords, imageUrl? }. */
export async function POST(request: Request) {
  const session = await readRequestSession();
  if (!session) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const body = await readBody(request);
  if (body === null) return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  return send(await reviewAdForX(session, body));
}
