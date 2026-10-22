import { NextResponse } from "next/server";
import { readTrackerWallet } from "@/server/tracker/wallet/service";
import { walletError, walletRequestUser } from "@/server/tracker/wallet/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in user's Tracker wallet: balance, movements, unfinished top-ups. */
export async function GET() {
  const gate = await walletRequestUser();
  if (gate.response) return gate.response;
  const result = await readTrackerWallet(gate.user);
  if (!result.ok) return walletError(result);
  return NextResponse.json({ ok: true, wallet: result.data });
}
