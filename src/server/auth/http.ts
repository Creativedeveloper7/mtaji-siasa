import { NextResponse } from "next/server";
import type { AuthSession, UserRole } from "@/types/auth";
import { currentSession, sessionHasRole } from "@/server/auth/service";

/** The signed-in user. Supabase Auth keeps the session in @supabase/ssr cookies. */
export async function readRequestSession(): Promise<AuthSession | null> {
  return currentSession();
}

/** Role gate for later route handlers. Returns a response when access is denied. */
export async function requireRoles(roles: readonly UserRole[]) {
  const session = await readRequestSession();
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { ok: false, error: "Sign in required." },
        { status: 401 }
      ),
    };
  }
  if (!sessionHasRole(session, roles)) {
    return {
      session,
      response: NextResponse.json(
        { ok: false, error: "You do not have access to this." },
        { status: 403 }
      ),
    };
  }
  return { session, response: null };
}
