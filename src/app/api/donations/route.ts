import { NextResponse } from "next/server";
import { siteUrl } from "@/server/seo";
import { startDonation } from "@/server/tracker/donations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The site Paystack sends the donor back to: PUBLIC_SITE_URL when set, this
 * server during local development, else the live site.
 */
function returnOrigin(request: Request): string {
  const configured = (process.env.PUBLIC_SITE_URL ?? "").trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  if (process.env.NODE_ENV !== "production") return new URL(request.url).origin;
  return siteUrl();
}

/**
 * Start a donation to a project or a leader. No sign-in needed.
 * Body: { projectId | leaderId, amount (KES), method?: "M-PESA" | "CARD-PAYMENT", email?, phone?, name? }.
 * Answers { ok, checkoutUrl, reference }; the browser goes to checkoutUrl.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be JSON." }, { status: 400 });
  }
  const result = await startDonation(body, returnOrigin(request));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.reason ? { reason: result.reason } : {}) },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true, ...result.data }, { status: result.status });
}
