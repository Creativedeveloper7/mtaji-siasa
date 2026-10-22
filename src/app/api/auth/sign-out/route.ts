import { NextResponse } from "next/server";
import { signOut } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}
