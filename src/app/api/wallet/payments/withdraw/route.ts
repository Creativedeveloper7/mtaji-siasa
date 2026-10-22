import { NextResponse } from "next/server";
import { requestWithdrawal } from "@/server/tracker/wallet/service";
import { readJson, walletError, walletRequestUser, withFreshWallet } from "@/server/tracker/wallet/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Request a payout through the Tracker's request_withdrawal RPC.
 * Body: { amount, method: "mpesa" | "bank_transfer", destination }.
 */
export async function POST(request: Request) {
  const gate = await walletRequestUser();
  if (gate.response) return gate.response;
  const body = await readJson<{ amount?: unknown; method?: unknown; destination?: unknown }>(request);
  if (!body) return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  const result = await requestWithdrawal(gate.user, body);
  if (!result.ok) return walletError(result);
  return withFreshWallet(gate.user, { withdrawalId: result.data.withdrawalId }, 201);
}
