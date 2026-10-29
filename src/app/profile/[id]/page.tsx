import { permanentRedirect } from "next/navigation";
import { usesTracker } from "@/server";
import { findPublicLeader } from "@/server/seo";
import { anonClient } from "@/server/tracker/clients";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The account's leader profile: the oldest political_figures row it owns (see docs, Ownership rule). */
async function leaderSlugForUser(userId: string): Promise<string | null> {
  if (!usesTracker() || !UUID.test(userId)) return null;
  const { data } = await anonClient()
    .from("political_figures")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  const figureId = (data as { id: string }[] | null)?.[0]?.id;
  if (!figureId) return null;
  return (await findPublicLeader(figureId))?.slug ?? null;
}

/**
 * /profile/<auth user id>: the address older ads and the Tracker link to.
 * Siasa shows people on /leaders/<slug>, so forward there, or to the leaders
 * list when the account has no public leader page.
 */
export default async function ProfileRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let slug: string | null = null;
  try {
    slug = await leaderSlugForUser(decodeURIComponent(id));
  } catch {
    slug = null;
  }
  permanentRedirect(slug ? `/leaders/${slug}` : "/leaders");
}
