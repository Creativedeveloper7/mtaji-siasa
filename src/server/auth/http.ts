import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthSession, UserRole } from "@/types/auth";
import { sessionForUserId, sessionHasRole } from "@/server/auth/service";
import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionUserId,
  sessionCookieOptions,
} from "@/server/auth/session";

export async function readRequestSession(): Promise<AuthSession | null> {
  const jar = await cookies();
  const userId = readSessionUserId(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return sessionForUserId(userId);
}

export function withSessionCookie(body: unknown, userId: string, status = 200) {
  const response = NextResponse.json(body, { status });
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(userId),
    sessionCookieOptions()
  );
  return response;
}

export function clearSessionCookie(body: unknown) {
  const response = NextResponse.json(body);
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return response;
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
