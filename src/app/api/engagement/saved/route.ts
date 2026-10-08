import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import type { ContentResult } from "@/server/content/service";
import { readSavedOpportunities, saveOpportunities } from "@/server/engagement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  return send(readSavedOpportunities(session));
}

export async function PUT(request: Request) {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(saveOpportunities(session, body));
}

function send(result: ContentResult) {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
