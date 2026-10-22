import { NextResponse } from "next/server";
import { readReturnReference } from "@/server/tracker/wallet/mapping";
import { verifyTopUp } from "@/server/tracker/wallet/service";
import { readJson, walletError, walletRequestUser, withFreshWallet } from "@/server/tracker/wallet/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirm a top-up when the user returns from Paystack. Body: { reference }.
 * Answers { ok, verification: { outcome: credited|processing|pending|failed, ... }, wallet }.
 */
export async function POST(request: Request) {
  const gate = await walletRequestUser();
  if (gate.response) return gate.response;
  const body = await readJson<{ reference?: unknown }>(request);
  const reference =
    typeof body?.reference === "string"
      ? readReturnReference(new URLSearchParams({ reference: body.reference }))
      : null;
  if (!reference) return NextResponse.json({ ok: false, error: "A payment reference is required." }, { status: 400 });
  const result = await verifyTopUp(gate.user, reference);
  if (!result.ok) return walletError(result);
  return withFreshWallet(gate.user, { verification: result.data }, 200);
}
