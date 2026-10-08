import { NextResponse } from "next/server";
import { withSessionCookie } from "@/server/auth/http";
import { signIn } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  const result = signIn(body?.email, body?.password);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }
  return withSessionCookie(
    { ok: true, session: result.session },
    result.session.userId
  );
}

async function readBody(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    return body;
  } catch {
    return null;
  }
}
