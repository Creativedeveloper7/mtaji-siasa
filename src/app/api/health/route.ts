import { NextResponse } from "next/server";
import { getRepositories } from "@/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const repositories = getRepositories();
  const leader = repositories.content.findLeaderBySlug("amara-njehia");
  const admin = repositories.users.findByEmail("admin@mtaji.ke");

  const persistence =
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memory";

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
