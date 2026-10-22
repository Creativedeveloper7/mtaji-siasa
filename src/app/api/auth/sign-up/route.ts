import { NextResponse } from "next/server";
import { signUp, type SignUpInput } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 201 { ok, session } when the account is signed in straight away, or
 * 201 { ok, needsConfirmation } when Supabase emails a confirmation link first.
 */
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
  const result = await signUp(body, new URL(request.url).origin);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }
  if ("needsConfirmation" in result) {
    return NextResponse.json({ ok: true, needsConfirmation: true }, { status: 201 });
  }
  return NextResponse.json({ ok: true, session: result.session }, { status: 201 });
}
