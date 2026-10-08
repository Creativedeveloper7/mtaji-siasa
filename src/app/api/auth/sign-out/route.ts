import { clearSessionCookie } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  return clearSessionCookie({ ok: true });
}
