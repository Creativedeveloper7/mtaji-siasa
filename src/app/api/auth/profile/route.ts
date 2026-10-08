import { NextResponse } from "next/server";
import { readRequestSession } from "@/server/auth/http";
import { ensurePoliticianProfile } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await readRequestSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  const result = ensurePoliticianProfile(session.userId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, session: result.session, leaderId: result.leaderId });
}
