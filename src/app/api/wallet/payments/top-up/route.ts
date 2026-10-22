import { NextResponse } from "next/server";
import { startTopUp } from "@/server/tracker/wallet/service";
import { readJson, topUpCallbackUrl, walletError, walletRequestUser } from "@/server/tracker/wallet/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a Paystack top-up. Body: { amount: number (KES), method?: "M-PESA" | "CARD-PAYMENT" }.
 * Answers { ok, checkoutUrl, reference }; the browser goes to checkoutUrl.
 * The wallet is credited later by the Paystack webhook or /verify.
 */
export async function POST(request: Request) {
  const gate = await walletRequestUser();
  if (gate.response) return gate.response;
  const body = await readJson<{ amount?: unknown; method?: unknown }>(request);
  if (!body) return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  const callback = topUpCallbackUrl(request);
  if (!callback.ok) return callback.response;
  const result = await startTopUp(gate.user, body, callback.url);
  if (!result.ok) return walletError(result);
  return NextResponse.json({ ok: true, ...result.data }, { status: result.status });
}
