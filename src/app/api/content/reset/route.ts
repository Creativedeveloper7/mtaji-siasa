import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { getRepositories } from "@/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requireRoles(["admin"]);
  if (gate.response) return gate.response;
  await getRepositories().content.reset();
  return NextResponse.json({ ok: true, content: await getRepositories().content.snapshot() });
}
