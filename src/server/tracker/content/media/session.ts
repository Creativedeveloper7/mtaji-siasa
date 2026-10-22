import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { anonClient, serviceClient, userClient } from "@/server/tracker/clients";
import { isUuid } from "@/server/tracker/slug";
import { indexFiguresByUser, phase1LeaderId, type FigureRef } from "./shared";

/**
 * Client plumbing and write ownership shared by the media, polls and products
 * slices. Public reads use anon. Writes use the signed-in user's session so
 * row-level security (author_id / owner_id = auth.uid()) decides. The service
 * client is used in exactly one case, see resolveOwner().
 */

export interface ContentClients {
  anon(): SupabaseClient;
  user(): Promise<SupabaseClient>;
  service(): SupabaseClient;
}

export const defaultContentClients: ContentClients = {
  anon: anonClient,
  user: userClient,
  service: serviceClient,
};

/** A failure the API layer can turn into an HTTP status. */
export class ContentWriteError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ContentWriteError";
  }
}

export function fail(what: string, error: { message: string }): never {
  throw new Error(`${what}: ${error.message}`);
}

/** The verified caller of a write. */
export interface Caller {
  client: SupabaseClient;
  user: User;
  /** app_metadata.role = 'admin'. Only the service role can write app_metadata. */
  isAdmin: boolean;
}

export async function requireCaller(clients: ContentClients): Promise<Caller> {
  const client = await clients.user();
  // getUser() asks Supabase Auth; the cookie alone is never trusted.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ContentWriteError(401, "Sign in required.");
  return { client, user: data.user, isAdmin: data.user.app_metadata?.role === "admin" };
}

/**
 * The user's own client when the request has a session, else null. Reads use
 * it only to find the caller's own non-public rows (draft blog, inactive
 * product) by id. cookies() throws outside a request (build, scripts), which
 * also yields null.
 */
export async function optionalUserClient(clients: ContentClients): Promise<SupabaseClient | null> {
  try {
    return await clients.user();
  } catch {
    return null;
  }
}

/** user id -> oldest political_figures row (the session's rule, compareFigures). Failures give an empty map (leaderId then falls back to the user id). */
export async function figuresForUsers(client: SupabaseClient, userIds: string[]): Promise<Map<string, FigureRef>> {
  const ids = [...new Set(userIds.filter((id) => id && isUuid(id)))];
  if (!ids.length) return new Map();
  const { data, error } = await client
    .from("political_figures")
    .select("id, user_id, name, created_at")
    .in("user_id", ids);
  if (error) return new Map();
  return indexFiguresByUser((data ?? []) as FigureRef[]);
}

/**
 * Reads one row the caller may write: with the caller's session first (RLS
 * shows their own rows), then, for an admin only, with the service client.
 */
export async function readRowForWrite<T>(
  caller: Caller,
  clients: ContentClients,
  table: string,
  id: string
): Promise<T | null> {
  if (!isUuid(id)) return null;
  const own = await caller.client.from(table).select("*").eq("id", id).maybeSingle();
  if (own.error) fail(`Could not load ${table} row`, own.error);
  if (own.data) return own.data as T;
  if (!caller.isAdmin) return null;
  // Admin edit of someone else's row: no RLS rule grants admins access (§16).
  const any = await clients.service().from(table).select("*").eq("id", id).maybeSingle();
  if (any.error) fail(`Could not load ${table} row`, any.error);
  return (any.data as T | null) ?? null;
}

export interface WriteTarget {
  /** Client the write runs with. */
  client: SupabaseClient;
  /** auth user id stored in author_id / owner_id. */
  ownerId: string;
  /** political_figures.name of the owner, when known (blogs.author_name). */
  ownerName?: string;
}

/**
 * Who owns a row being written, and which client may write it.
 *
 * Owner:
 * - update: the existing row's owner. Ownership never moves on update. A row
 *   with no owner (products only) can be changed by an admin only.
 * - insert: the auth user behind `leaderId` (political_figures.user_id), or the
 *   caller when leaderId is empty, the caller's own user id, or the caller's
 *   Phase 1 leader id `user-<uid>` (sessions without a figure).
 *
 * Client:
 * - owner = caller: the caller's session (RLS: author/owner = auth.uid()).
 * - owner != caller and the caller is a verified admin: the service client,
 *   because no RLS rule lets an admin write another user's row (§16). The
 *   content service has already checked the actor is an admin before it lets
 *   leaderId differ from the actor; this re-checks from auth.getUser().
 * - otherwise 403.
 */
export async function resolveOwner(
  caller: Caller,
  clients: ContentClients,
  existing: { ownerId: string | null } | null,
  leaderId: string | undefined
): Promise<WriteTarget> {
  let ownerId: string;
  let ownerName: string | undefined;

  if (existing && !existing.ownerId) {
    // products.author_id is nullable (ON DELETE SET NULL): an ownerless row
    // matches no owner policy, so only an admin can change it.
    if (!caller.isAdmin) throw new ContentWriteError(403, "You can only edit records linked to your profile.");
    return { client: clients.service(), ownerId: "" };
  }
  if (existing?.ownerId) {
    ownerId = existing.ownerId;
  } else if (leaderId && leaderId !== caller.user.id && leaderId !== phase1LeaderId(caller.user.id)) {
    if (!isUuid(leaderId)) {
      throw new ContentWriteError(400, "Leader was not found.");
    }
    const reader = caller.isAdmin ? clients.service() : caller.client;
    const { data, error } = await reader
      .from("political_figures")
      .select("id, user_id, name")
      .eq("id", leaderId)
      .maybeSingle();
    if (error) fail("Could not load the leader", error);
    const figure = data as FigureRef | null;
    if (!figure) throw new ContentWriteError(400, "Leader was not found.");
    if (!figure.user_id) {
      throw new ContentWriteError(400, "This leader has no M-Taji account yet, so it cannot own content.");
    }
    ownerId = figure.user_id;
    ownerName = figure.name ?? undefined;
  } else {
    ownerId = caller.user.id;
  }

  let client: SupabaseClient;
  if (ownerId === caller.user.id) client = caller.client;
  else if (caller.isAdmin) client = clients.service();
  else throw new ContentWriteError(403, "You can only edit records linked to your profile.");

  if (!ownerName) {
    const figures = await figuresForUsers(client, [ownerId]);
    ownerName = figures.get(ownerId)?.name ?? undefined;
    if (!ownerName && ownerId === caller.user.id) {
      const meta = caller.user.user_metadata as Record<string, unknown> | undefined;
      ownerName = typeof meta?.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : undefined;
    }
  }
  return { client, ownerId, ownerName };
}
