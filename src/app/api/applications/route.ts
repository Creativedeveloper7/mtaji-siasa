import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import type { ContentResult } from "@/server/content/service";
import {
  listMyApplications,
  listReceivedApplications,
  submitApplication,
} from "@/server/applications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ?scope=mine (default) lists what you applied for; ?scope=received lists applications to your opportunities. */
export async function GET(request: Request) {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const scope = new URL(request.url).searchParams.get("scope");
  return send(
    scope === "received"
      ? await listReceivedApplications(session)
      : await listMyApplications(session)
  );
}

export async function POST(request: Request) {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in to apply." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(await submitApplication(session, body));
}

function send(result: ContentResult) {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
