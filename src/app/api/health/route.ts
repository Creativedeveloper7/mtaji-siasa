import { NextResponse } from "next/server";
import { getRepositories, usesTracker } from "@/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const repositories = getRepositories();
  const persistence = usesTracker() ? "tracker" : "memory";
  try {
    const leader = await repositories.content.findLeaderBySlug("amara-njehia");
    // Seed accounts exist only in memory mode; Tracker accounts are real users.
    const admin =
      persistence === "memory" ? await repositories.users.findByEmail("admin@mtaji.ke") : undefined;
    return NextResponse.json({
      ok: true,
      persistence,
      counts: await repositories.counts(),
      checks: {
        seedLeaderLoaded: leader?.slug === "amara-njehia",
        ...(persistence === "memory" ? { seedAdminLoaded: Boolean(admin) } : {}),
      },
    });
  } catch (error) {
    console.error("[health] store check failed", error);
    return NextResponse.json({ ok: false, persistence, error: "Store check failed." }, { status: 503 });
  }
}
