import { NextResponse } from "next/server";
import { verifyProjectDonation } from "@/server/tracker/donations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirm a donation when the donor returns from Paystack. Body: { reference }. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  const result = await verifyProjectDonation(body);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, ...result.data });
}
