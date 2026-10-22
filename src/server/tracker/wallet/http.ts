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

/**
 * Where Paystack sends the user back to. In production this must come from
 * PUBLIC_SITE_URL: the request's own origin follows the Host header, which a
 * client controls. Outside production the request origin is used as a fallback.
 */
export function topUpCallbackUrl(
  request: Request
): { ok: true; url: string; response?: undefined } | { ok: false; response: NextResponse } {
  const site = (process.env.PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (site) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(site);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
      return { ok: false, response: callbackConfigError("PUBLIC_SITE_URL is not a valid http(s) URL.") };
    }
    return { ok: true, url: `${parsed.origin}/dashboard/wallet?topup=1` };
  }
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      response: callbackConfigError("PUBLIC_SITE_URL must be set in production for Paystack top-ups."),
    };
  }
  return { ok: true, url: `${new URL(request.url).origin}/dashboard/wallet?topup=1` };
}

function callbackConfigError(detail: string): NextResponse {
  console.error(`[wallet] ${detail}`);
  return NextResponse.json(
    { ok: false, error: "Top-ups are not configured on this server (missing site URL). Contact support." },
    { status: 500 }
  );
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
