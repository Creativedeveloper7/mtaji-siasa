import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import type { ContentResult } from "@/server/content/service";
import { listAdlyInterests, submitAdlyInterest } from "@/server/engagement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRoles(["admin"]);
  if (gate.response) return gate.response;
  return send(listAdlyInterests());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  return send(submitAdlyInterest(body));
}

function send(result: ContentResult) {
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body, { status: result.status });
}
