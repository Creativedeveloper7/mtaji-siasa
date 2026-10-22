import "server-only";
import { NextResponse } from "next/server";
import { usesTracker } from "@/server";
import { requireRoles } from "@/server/auth/http";
import { readTrackerWallet, signedInWalletUser, type WalletResult } from "./service";

/** Roles that see the politician wallet page. Each manages only their own Tracker wallet. */
const WALLET_ROLES = ["admin", "leader", "aspirant"] as const;

type WalletUser = Extract<Awaited<ReturnType<typeof signedInWalletUser>>, { ok: true }>["data"];

/** Gate for /api/wallet/payments/*: Tracker configured, signed in, allowed role. */
export async function walletRequestUser(): Promise<
  { user: WalletUser; response?: undefined } | { response: NextResponse }
> {
  if (!usesTracker()) {
    return {
      response: NextResponse.json(
        { ok: false, error: "Payments need the M-Taji Tracker backend, which is not configured here." },
        { status: 503 }
      ),
    };
  }
  const gate = await requireRoles(WALLET_ROLES);
  if (gate.response || !gate.session) {
    return {
      response:
        gate.response ?? NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 }),
    };
  }
  const signedIn = await signedInWalletUser(gate.session.userId);
  if (!signedIn.ok) {
    return { response: NextResponse.json({ ok: false, error: signedIn.error }, { status: signedIn.status }) };
  }
  return { user: signedIn.data };
}

export function walletError(result: { status: number; error: string }) {
  return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
}

/** Respond with `body` plus the fresh wallet. A failed re-read does not hide a successful action. */
export async function withFreshWallet(user: WalletUser, body: Record<string, unknown>, status: number) {
  const wallet = await readTrackerWallet(user);
  return NextResponse.json({ ok: true, ...body, wallet: wallet.ok ? wallet.data : undefined }, { status });
}

/** Where Paystack sends the user back to. PUBLIC_SITE_URL wins over the request's own origin. */
export function topUpCallbackUrl(request: Request): string {
  const site = (process.env.PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const origin = site || new URL(request.url).origin;
  return `${origin}/dashboard/wallet?topup=1`;
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as T) : null;
  } catch {
    return null;
  }
}

export type { WalletResult };
