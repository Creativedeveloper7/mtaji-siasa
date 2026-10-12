import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import type { ContentResult } from "@/server/content/service";
import { reviewApplication, withdrawApplication } from "@/server/applications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Opportunity owner updates status / review note. */
export async function PATCH(request: Request, context: Context) {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(reviewApplication(session, id, body));
}

/** Applicant withdraws an application that has not been reviewed yet. */
export async function DELETE(_request: Request, context: Context) {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  return send(withdrawApplication(session, id));
}

function send(result: ContentResult) {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
