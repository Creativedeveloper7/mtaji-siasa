import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { usesTracker } from "@/server";
import { userClient } from "@/server/tracker/clients";
import { safeNext } from "@/lib/safe-next";

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
  // Only same-site paths, so the link cannot bounce users to another site.
  const next = safeNext(url.searchParams.get("next"), url.origin);
  const withNext = (path: string) =>
    next === "/" ? path : `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
  const to = (path: string) => NextResponse.redirect(new URL(withNext(path), url.origin));

  if ((!code && !(tokenHash && type)) || !usesTracker()) {
    return to("/signin?error=confirmation");
  }
  const client = await userClient();
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    // GoTrue confirms the email before the code is exchanged, so a failure here
    // (usually: link opened in another browser, no PKCE verifier cookie) most
    // likely means the account is confirmed but this browser has no session.
    if (error) return to("/signin?confirmed=maybe");
    return to("/signin");
  }
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
  if (error) return to("/signin?error=confirmation");
  return to("/signin");
}
