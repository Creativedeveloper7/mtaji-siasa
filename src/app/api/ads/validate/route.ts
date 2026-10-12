import { NextResponse } from "next/server";
import { requireRoles } from "@/server/auth/http";
import { asString, isRecord } from "@/server/content/parse";
import { validateGoogleSetup } from "@/server/ads/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admin: dry-run a full Google Ads campaign (validateOnly) with the given image. Creates nothing. */
export async function POST(request: Request) {
  const gate = await requireRoles(["admin"]);
  if (gate.response) return gate.response;
  const body = await request.json().catch(() => null);
  const imageUrl = isRecord(body) ? asString(body.imageUrl) : undefined;
  if (!imageUrl) return NextResponse.json({ ok: false, error: "imageUrl is required." }, { status: 400 });
  const result = await validateGoogleSetup(imageUrl);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result.body);
}
