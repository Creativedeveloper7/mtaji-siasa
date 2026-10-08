import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { adminDeleteUser, adminUpsertUser, listDirectory } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireRoles(["admin"]);
  if (gate.response || !gate.session) return gate.response;
  return NextResponse.json({ ok: true, users: listDirectory() });
}

export async function PUT(request: Request) {
  const gate = await requireRoles(["admin"]);
  if (gate.response) return gate.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  const result = adminUpsertUser(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, user: result.session });
}

export async function DELETE(request: Request) {
  const gate = await requireRoles(["admin"]);
  if (gate.response || !gate.session) return gate.response;
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  const result = adminDeleteUser(gate.session.userId, id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
