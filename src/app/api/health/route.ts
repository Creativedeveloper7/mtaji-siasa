import { NextResponse } from "next/server";
import { getRepositories, usesSupabase } from "@/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const repositories = getRepositories();
  const leader = repositories.content.findLeaderBySlug("amara-njehia");
  const admin = repositories.users.findByEmail("admin@mtaji.ke");

  const persistence = usesSupabase() ? "supabase" : "memory";

  return NextResponse.json({
    ok: true,
    persistence,
    counts: repositories.counts(),
    checks: {
      seedLeaderLoaded: leader?.slug === "amara-njehia",
      seedAdminLoaded: Boolean(admin),
    },
  });
}
