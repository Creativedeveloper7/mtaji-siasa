import { NextResponse } from "next/server";
import { withSessionCookie } from "@/server/auth/http";
import { signUp, type SignUpInput } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: SignUpInput;
  try {
    body = (await request.json()) as SignUpInput;
  } catch {
    body = {
      fullName: undefined,
      email: undefined,
      phone: undefined,
      password: undefined,
      role: undefined,
    };
  }
  const result = signUp(body);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }
  return withSessionCookie(
    { ok: true, session: result.session },
    result.session.userId,
    201
  );
}
