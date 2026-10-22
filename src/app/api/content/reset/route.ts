import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { getRepositories, usesTracker } from "@/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Restores the sample content. Memory store only: Tracker data is never reset from Siasa. */
export async function POST() {
  const gate = await requireRoles(["admin"]);
  if (gate.response) return gate.response;
  if (usesTracker()) {
    return NextResponse.json(
      { ok: false, error: "Content lives in the M-Taji Tracker database and is never reset from Siasa." },
      { status: 403 }
    );
  }
  await getRepositories().content.reset();
  return NextResponse.json({ ok: true, content: await getRepositories().content.snapshot() });
}
