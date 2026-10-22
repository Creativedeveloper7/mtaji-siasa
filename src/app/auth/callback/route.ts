import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { usesTracker } from "@/server";
import { userClient } from "@/server/tracker/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Landing page for Supabase email links (sign-up confirmation). Exchanges the
 * one-time code (PKCE, same browser) or token_hash (email template link, any
 * device) for a session cookie, then sends the user to /signin, which forwards
 * a signed-in user to their workspace.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "";
  // Only same-site paths, so the link cannot bounce users to another site.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
  const destination = safeNext ? `/signin?next=${encodeURIComponent(safeNext)}` : "/signin";

  if ((!code && !(tokenHash && type)) || !usesTracker()) {
    return NextResponse.redirect(new URL("/signin?error=confirmation", url.origin));
  }
  const client = await userClient();
  const { error } = code
    ? await client.auth.exchangeCodeForSession(code)
    : await client.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  if (error) {
    return NextResponse.redirect(new URL("/signin?error=confirmation", url.origin));
  }
  return NextResponse.redirect(new URL(destination, url.origin));
}
