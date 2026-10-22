import { NextResponse } from "next/server";
import { signIn } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Supabase Auth writes the session cookies on this response. */
export async function POST(request: Request) {
  const body = await readBody(request);
  const result = await signIn(body?.email, body?.password);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, session: result.session });
}

async function readBody(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    return body;
  } catch {
    return null;
  }
}
